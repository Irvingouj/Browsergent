import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "preact/hooks";
import { useStore } from "zustand/react";
import type { FilesController } from "../../../controllers/files-controller";
import { getSkillService } from "../../../skills/skill-service";
import type { SkillMeta } from "../../../skills/skill-types";
import {
	selectFilesVersion,
	selectMessageIds,
	selectMessagesById,
	selectOpenTabs,
	selectSkillCatalog,
} from "../../../state/selectors";
import { browsergentStore } from "../../../state/store";
import type { ChatMessage } from "../../../types/messages";
import {
	buildPickerInsert,
	filesToPickerItems,
	tabsToPickerItems,
} from "../../detect-mention-state";
import { type CommandPickerItem, filterPickerItems } from "../CommandPicker";
import {
	CLOSED_MODE,
	type InputMode,
	interpretKey,
	type KeyActionCtx,
	resolveInputMode,
} from "./input-mode";
import type { Draft, EditorCommand } from "./draft-model";
import { parseDraftAtOffset, serializeDraft } from "./draft-model";

export function skillsToPickerItems(
	skills: ReadonlyArray<SkillMeta>,
): CommandPickerItem[] {
	return skills.map((skill) => ({
		id: skill.name,
		label: `skill:${skill.name}`,
		description: skill.description,
		insertText: `/skill:${skill.name} `,
	}));
}

export interface InputModeApi {
	mode: InputMode;
	isPickerOpen: boolean;
	pickerItems: CommandPickerItem[];
	activeIndex: number;
	emptyMessage: string;
	onRead(value: string, offset: number): void;
	onKeyDown(e: KeyboardEvent): void;
	onBlur(): void;
	setActiveIndex(index: number): void;
	applySelection(item: CommandPickerItem): void;
	loadSkills(): void;
}

interface UseInputModeArgs {
	filesController: FilesController | null;
	isRunning: boolean;
	onSubmit: () => void;
	/** Read the latest Draft synchronously (key handlers close over one render). */
	getDraft: () => Draft;
	/** Dispatch a programmatic EditorCommand (insert-chip, history, submit). */
	dispatch: (command: EditorCommand) => void;
}

export function useInputMode({
	filesController,
	isRunning,
	onSubmit,
	getDraft,
	dispatch,
}: UseInputModeArgs): InputModeApi {
	const skills = useStore(browsergentStore, selectSkillCatalog);
	const openTabs = useStore(browsergentStore, selectOpenTabs);
	const messageIds = useStore(browsergentStore, selectMessageIds);
	const messagesById = useStore(browsergentStore, selectMessagesById);
	const filesVersion = useStore(browsergentStore, selectFilesVersion);

	const [mode, setMode] = useState<InputMode>(CLOSED_MODE);
	const modeRef = useRef<InputMode>(mode);
	modeRef.current = mode;

	const [filePickerItems, setFilePickerItems] = useState<CommandPickerItem[]>(
		[],
	);
	const store = browsergentStore;

	// design: 这里曾用 cursorRef + pendingCaret + pendingFileCaret 三个变量管理光标,
	// 导致每个新动作都要记得 setPendingCaret,漏一个就是幽灵光标跳动。现在光标是
	// Draft zipper 的缝隙,程序化动作通过 dispatch(EditorCommand) 走 reducer,
	// 光标恢复是 reconcile 的一部分,无需手动管理。

	// --- History data ---
	const userHistory = useMemo(
		() =>
			messageIds
				.map((id) => messagesById[id])
				.filter((m): m is ChatMessage & { kind: "user" } => m?.kind === "user")
				.map((m) => m.text),
		[messageIds, messagesById],
	);

	// --- Skill loading ---
	const loadSkills = useCallback((): void => {
		getSkillService()
			.listSkills()
			.then((catalog: SkillMeta[]) =>
				store.getState().skillsCatalogChanged(catalog),
			)
			.catch((err: unknown) => {
				console.warn("Failed to load skills for picker:", err);
			});
	}, [store]);

	useEffect(() => {
		const unsubscribe = getSkillService().subscribeSkillsChanged(
			(catalog: SkillMeta[]) => store.getState().skillsCatalogChanged(catalog),
		);
		return unsubscribe;
	}, [store]);

	// --- Tabs listener (lazy, while at picker is open) ---
	useEffect(() => {
		if (mode.kind !== "picker-at") return;
		const refresh = (): void => {
			chrome.tabs
				.query({})
				.then((tabs: chrome.tabs.Tab[]) => store.getState().setOpenTabs(tabs))
				.catch((err: unknown) => {
					console.warn("Failed to query open tabs:", err);
				});
		};
		refresh();
		const interval = setInterval(refresh, 2000);
		return () => clearInterval(interval);
	}, [mode.kind, store]);

	// --- File fetch (live, while at picker is open) ---
	useEffect(() => {
		if (mode.kind !== "picker-at") return;
		let cancelled = false;
		filesController
			?.listAllFiles()
			.then((nodes) => {
				if (!cancelled) setFilePickerItems(filesToPickerItems(nodes));
			})
			.catch((err: unknown) => {
				console.warn("Failed to load files for picker:", err);
			});
		return () => {
			cancelled = true;
		};
	}, [mode.kind, filesController, filesVersion]);

	// --- Picker items ---
	const skillPickerItems = useMemo(() => skillsToPickerItems(skills), [skills]);
	const filteredSkillItems = useMemo(
		() =>
			mode.kind === "picker-slash"
				? filterPickerItems(skillPickerItems, mode.query)
				: [],
		[skillPickerItems, mode],
	);
	const filteredFileItems = useMemo(
		() =>
			mode.kind === "picker-at"
				? filterPickerItems(filePickerItems, mode.query)
				: [],
		[filePickerItems, mode],
	);
	const tabPickerItems = useMemo(() => tabsToPickerItems(openTabs), [openTabs]);
	const filteredTabItems = useMemo(
		() =>
			mode.kind === "picker-at"
				? filterPickerItems(tabPickerItems, mode.query)
				: [],
		[tabPickerItems, mode],
	);

	const isPickerOpen =
		mode.kind === "picker-at" || mode.kind === "picker-slash";
	const pickerItems =
		mode.kind === "picker-at"
			? [...filteredFileItems, ...filteredTabItems]
			: filteredSkillItems;
	const emptyMessage =
		mode.kind === "picker-at"
			? "No matching files or tabs"
			: "No matching skills";
	const activeIndex =
		mode.kind === "picker-at" || mode.kind === "picker-slash"
			? mode.activeIndex
			: 0;

	// --- Typing path: ChipInput reports (value, offset), resolve picker mode ---
	const onRead = useCallback((value: string, offset: number): void => {
		setMode((prev) => resolveInputMode(value, offset, prev));
	}, []);

	// --- Key handling ---
	const onKeyDown = useCallback(
		(e: KeyboardEvent): void => {
			const draft = getDraft();
			const value = serializeDraft(draft);
			// cursor offset = sum of left lengths (zipper gap)
			let cursor = 0;
			for (const inline of draft.left) {
				cursor += inline.kind === "text" ? inline.value.length : inline.raw.length;
			}
			const caretAtStart = cursor === 0;
			const caretAtEnd = cursor === value.length;
			const itemCount = pickerItems.length;

			const ctx: KeyActionCtx = {
				itemCount,
				caretAtStart,
				caretAtEnd,
				isRunning,
			};
			const action = interpretKey(modeRef.current, e, ctx);
			if (!action) return;

			e.preventDefault();

			// Apply mode transition
			if (action.nextMode) setMode(action.nextMode);

			// Apply side effects
			if (action.effect === "submit") {
				onSubmit();
				return;
			}

			if (action.effect === "dismiss-picker") {
				return;
			}

			if (action.effect === "restore-draft") {
				const restoredDraft =
					modeRef.current.kind === "history" ? modeRef.current.savedDraft : "";
				dispatch({
					kind: "replace-from-history",
					draft: parseDraftAtOffset(restoredDraft, restoredDraft.length),
				});
				return;
			}

			if (action.effect === "recall-history") {
				if (action.recallDirection === "older") {
					const currentDraft = value;
					if (modeRef.current.kind === "history") {
						const newIdx = modeRef.current.index - 1;
						if (newIdx >= 0) {
							const msg = userHistory[newIdx];
							setMode({
								kind: "history",
								index: newIdx,
								savedDraft: modeRef.current.savedDraft,
							});
							if (msg) {
								dispatch({
									kind: "replace-from-history",
									draft: parseDraftAtOffset(msg, msg.length),
								});
							}
						}
					} else {
						const lastIdx = userHistory.length - 1;
						if (lastIdx >= 0) {
							const msg = userHistory[lastIdx];
							setMode((prev) =>
								prev.kind === "history"
									? prev
									: { kind: "history", index: lastIdx, savedDraft: currentDraft },
							);
							if (msg) {
								dispatch({
									kind: "replace-from-history",
									draft: parseDraftAtOffset(msg, msg.length),
								});
							}
						}
					}
				} else if (action.recallDirection === "newer") {
					if (modeRef.current.kind !== "history") return;
					if (modeRef.current.index < userHistory.length - 1) {
						const newIdx = modeRef.current.index + 1;
						const msg = userHistory[newIdx];
						setMode({ ...modeRef.current, index: newIdx });
						if (msg) {
							dispatch({
								kind: "replace-from-history",
								draft: parseDraftAtOffset(msg, msg.length),
							});
						}
					} else {
						setMode(CLOSED_MODE);
						const restored = modeRef.current.savedDraft;
						dispatch({
							kind: "replace-from-history",
							draft: parseDraftAtOffset(restored, restored.length),
						});
					}
				}
				return;
			}

			if (action.effect === "select-active") {
				const items = pickerItems;
				if (items.length > 0) {
					const idx =
						modeRef.current.kind === "picker-at" ||
						modeRef.current.kind === "picker-slash"
							? modeRef.current.activeIndex
							: 0;
					const item = items[Math.min(idx, items.length - 1)];
					if (item) applyPickerSelection(item);
				}
				return;
			}

			// text-edit effects (delete-word/to-eol/line) — these mutate text,
			// which is browser-led editing territory. Defer to the next input
			// event: we don't intercept them, let the browser handle and onRead
			// will pick up the result. (They are Ctrl-Backspace / Cmd-K combos;
			// falling through to default browser behavior is acceptable.)
		},
		[isRunning, onSubmit, getDraft, dispatch, pickerItems, userHistory],
	);

	// --- Blur ---
	const onBlur = useCallback((): void => {
		setMode(CLOSED_MODE);
	}, []);

	// --- Selection ---
	const setActiveIndex = useCallback((index: number): void => {
		setMode((prev) => {
			if (prev.kind === "picker-at" || prev.kind === "picker-slash") {
				return { ...prev, activeIndex: index };
			}
			return prev;
		});
	}, []);

	const applyPickerSelection = useCallback(
		(item: CommandPickerItem): void => {
			const draft = getDraft();
			const value = serializeDraft(draft);
			let cursor = 0;
			for (const inline of draft.left) {
				cursor += inline.kind === "text" ? inline.value.length : inline.raw.length;
			}
			const currentState = modeRef.current;
			const startIndex =
				currentState.kind === "picker-at" ||
				currentState.kind === "picker-slash"
					? currentState.startIndex
					: 0;
			const endIndex =
				currentState.kind === "picker-at" ? currentState.endIndex : undefined;
			const { nextText, cursorPos } = buildPickerInsert(
				value,
				cursor,
				startIndex,
				item.insertText,
				endIndex,
			);
			dispatch({
				kind: "replace-from-history",
				draft: parseDraftAtOffset(nextText, cursorPos),
			});
			setMode(CLOSED_MODE);
		},
		[getDraft, dispatch],
	);

	return {
		mode,
		isPickerOpen,
		pickerItems,
		activeIndex,
		emptyMessage,
		onRead,
		onKeyDown,
		onBlur,
		setActiveIndex,
		applySelection: applyPickerSelection,
		loadSkills,
	};
}
