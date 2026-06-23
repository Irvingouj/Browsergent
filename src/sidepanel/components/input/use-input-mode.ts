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
	onInput(value: string, cursor: number): void;
	onKeyDown(e: KeyboardEvent): void;
	onBlur(): void;
	setActiveIndex(index: number): void;
	applySelection(item: CommandPickerItem): void;
	loadSkills(): void;
	/** Caret offset to restore after the next external value change. */
	pendingCaret: number | undefined;
}

interface UseInputModeArgs {
	filesController: FilesController | null;
	isRunning: boolean;
	onSubmit: () => void;
}
export function useInputMode({
	filesController,
	isRunning,
	onSubmit,
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

	// Caret offset tracked from ChipInput's onChange; DOM-agnostic replacement
	// for reading textarea.selectionStart/End directly.
	const cursorRef = useRef(0);
	// Caret offset to restore after the next external value change (picker
	// insert, history recall). ChipInput consumes and clears this.
	const [pendingCaret, setPendingCaret] = useState<number | undefined>(
		undefined,
	);

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
		const onUpdated = (): void => refresh();
		const onRemoved = (): void => refresh();
		chrome.tabs.onUpdated?.addListener(onUpdated);
		chrome.tabs.onRemoved?.addListener(onRemoved);
		return () => {
			chrome.tabs.onUpdated?.removeListener(onUpdated);
			chrome.tabs.onRemoved?.removeListener(onRemoved);
		};
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

	// --- Text mutation → mode resolution ---
	const onInput = useCallback((value: string, cursor: number): void => {
		cursorRef.current = cursor;
		setMode((prev) => resolveInputMode(value, cursor, prev));
		// User input supersedes any pending programmatic caret restore.
		setPendingCaret(undefined);
	}, []);

	// --- Key handling ---
	const onKeyDown = useCallback(
		(e: KeyboardEvent): void => {
			const cursor = cursorRef.current;
			const val = store.getState().ui.taskDraft;
			const caretAtStart = cursor === 0;
			const caretAtEnd = cursor === val.length;
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

			// Apply text-editing commands
			if (action.effect === "delete-word") {
				const ss = cursor;
				let nextText: string;
				let nextCursor: number;
				let i = ss - 1;
				while (i >= 0 && val[i] === " ") i--;
				while (i >= 0 && val[i] !== " ") i--;
				const wordStart = i + 1;
				nextText = val.slice(0, wordStart) + val.slice(ss);
				nextCursor = wordStart;
				store.getState().setTaskDraft(nextText);
				cursorRef.current = nextCursor;
				setPendingCaret(nextCursor);
				setMode(CLOSED_MODE);
				return;
			}

			if (action.effect === "delete-to-eol") {
				const pos = cursor;
				const nextNewline = val.indexOf("\n", pos);
				const end = nextNewline === -1 ? val.length : nextNewline;
				const nextText = val.slice(0, pos) + val.slice(end);
				store.getState().setTaskDraft(nextText);
				cursorRef.current = pos;
				setPendingCaret(pos);
				setMode(CLOSED_MODE);
				return;
			}

			if (action.effect === "delete-line") {
				const pos = cursor;
				const lineStart = val.lastIndexOf("\n", pos - 1) + 1;
				const nextNewline = val.indexOf("\n", pos);
				const lineEnd = nextNewline === -1 ? val.length : nextNewline + 1;
				const nextText = val.slice(0, lineStart) + val.slice(lineEnd);
				const nextCursor = Math.min(lineStart, nextText.length);
				store.getState().setTaskDraft(nextText);
				cursorRef.current = nextCursor;
				setPendingCaret(nextCursor);
				setMode(CLOSED_MODE);
				return;
			}

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
			store.getState().setTaskDraft(restoredDraft);
			cursorRef.current = restoredDraft.length;
			setPendingCaret(restoredDraft.length);
			return;
		}

			if (action.effect === "recall-history") {
				if (action.recallDirection === "older") {
					const draft = store.getState().ui.taskDraft;
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
								store.getState().setTaskDraft(msg);
								cursorRef.current = msg.length;
								setPendingCaret(msg.length);
							}
						}
					} else {
						// Enter history from plain
						const lastIdx = userHistory.length - 1;
						if (lastIdx >= 0) {
							const msg = userHistory[lastIdx];
							setMode((prev) =>
								prev.kind === "history"
									? prev
									: { kind: "history", index: lastIdx, savedDraft: draft },
							);
							if (msg) {
								store.getState().setTaskDraft(msg);
								cursorRef.current = msg.length;
								setPendingCaret(msg.length);
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
							store.getState().setTaskDraft(msg);
							cursorRef.current = msg.length;
							setPendingCaret(msg.length);
						}
					} else {
						// Past the newest → restore draft
						setMode(CLOSED_MODE);
						const restored = modeRef.current.savedDraft;
						store.getState().setTaskDraft(restored);
						cursorRef.current = restored.length;
						setPendingCaret(restored.length);
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
		},
		[isRunning, onSubmit, pickerItems, store, userHistory],
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
			const draft = store.getState().ui.taskDraft;
			const currentState = modeRef.current;
			const startIndex =
				currentState.kind === "picker-at" ||
				currentState.kind === "picker-slash"
					? currentState.startIndex
					: 0;
			const endIndex =
				currentState.kind === "picker-at" ? currentState.endIndex : undefined;
			const fallbackCursor =
				startIndex +
				1 +
				(currentState.kind === "picker-at" ||
				currentState.kind === "picker-slash"
					? currentState.query.length
					: 0);
			const cursor = cursorRef.current ?? fallbackCursor;
			const { nextText, cursorPos } = buildPickerInsert(
				draft,
				cursor,
				startIndex,
				item.insertText,
				endIndex,
			);
			store.getState().setTaskDraft(nextText);
			cursorRef.current = cursorPos;
			setPendingCaret(cursorPos);
			setMode(CLOSED_MODE);
		},
		[store],
	);

	return {
		mode,
		isPickerOpen,
		pickerItems,
		activeIndex,
		emptyMessage,
		onInput,
		onKeyDown,
		onBlur,
		setActiveIndex,
		applySelection: applyPickerSelection,
		loadSkills,
		pendingCaret,
	};
}
