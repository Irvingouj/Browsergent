import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Ref } from "preact";
import { useStore } from "zustand/react";
import { browsergentStore } from "../../../state/store";
import {
	selectOpenTabs,
	selectSkillCatalog,
} from "../../../state/selectors";
import type { FilesController } from "../../../controllers/files-controller";
import type { SkillMeta } from "../../../skills/skill-types";
import { getSkillService } from "../../../skills/skill-service";
import {
	buildPickerInsert,
	filesToPickerItems,
	resolvePickerState,
	tabsToPickerItems,
} from "../../detect-mention-state";
import {
	type CommandPickerItem,
	filterPickerItems,
} from "../CommandPicker";

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

type PickerMode = "none" | "at" | "slash";

interface PickerState {
	mode: PickerMode;
	query: string;
	startIndex: number;
	endIndex: number;
	activeIndex: number;
}

const CLOSED_STATE: PickerState = {
	mode: "none",
	query: "",
	startIndex: 0,
	endIndex: 0,
	activeIndex: 0,
};

export interface PickerApi {
	isPickerOpen: boolean;
	pickerItems: CommandPickerItem[];
	activeIndex: number;
	emptyMessage: string;
	refreshPickerState(value: string, cursor: number | null): void;
	applyPickerSelection(item: CommandPickerItem): void;
	dismissPicker(): void;
	setActiveIndex(index: number): void;
	loadSkills(): void;
	handlePickerKeyDown(e: KeyboardEvent): boolean;
}

/**
 * Owns the compose picker (skill `/`, file/tab `@`) state. File entries are
 * fetched live from the filesystem when the @ picker opens — no slice cache.
 */
export function usePicker(
	inputRef: Ref<HTMLTextAreaElement> | undefined,
	filesController: FilesController | null,
): PickerApi {
	const skills = useStore(browsergentStore, selectSkillCatalog);
	const openTabs = useStore(browsergentStore, selectOpenTabs);

	const [filePickerItems, setFilePickerItems] = useState<CommandPickerItem[]>(
		[],
	);

	const [pickerState, setPickerState] = useState<PickerState>(CLOSED_STATE);
	const pickerStateRef = useRef<PickerState>(pickerState);
	pickerStateRef.current = pickerState;

	const store = browsergentStore;
	const pickerItemsRef = useRef<CommandPickerItem[]>([]);

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

	// Load open tabs (lazy) while the @ picker is open, and keep them fresh.
	useEffect(() => {
		if (pickerState.mode !== "at") return;
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
	}, [pickerState.mode, store]);

	// Fetch file entries live from the filesystem every time the @ picker opens.
	useEffect(() => {
		if (pickerState.mode !== "at") return;
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
	}, [pickerState.mode, filesController]);

	const skillPickerItems = useMemo(
		() => skillsToPickerItems(skills),
		[skills],
	);
	const filteredSkillItems = useMemo(
		() =>
			pickerState.mode === "slash" ? filterPickerItems(skillPickerItems, pickerState.query) : [],
		[skillPickerItems, pickerState.mode, pickerState.query],
	);
	const filteredFileItems = useMemo(
		() => pickerState.mode === "at" ? filterPickerItems(filePickerItems, pickerState.query) : [],
		[filePickerItems, pickerState.mode, pickerState.query],
	);
	const tabPickerItems = useMemo(
		() => tabsToPickerItems(openTabs),
		[openTabs],
	);
	const filteredTabItems = useMemo(
		() => pickerState.mode === "at" ? filterPickerItems(tabPickerItems, pickerState.query) : [],
		[tabPickerItems, pickerState.mode, pickerState.query],
	);

	const isPickerOpen = pickerState.mode !== "none";
	const pickerItems =
		pickerState.mode === "at"
			? [...filteredFileItems, ...filteredTabItems]
			: filteredSkillItems;
	pickerItemsRef.current = pickerItems;
	const emptyMessage =
		pickerState.mode === "at" ? "No matching files or tabs" : "No matching skills";

	const refreshPickerState = useCallback(
		(value: string, cursor: number | null): void => {
			if (cursor === null) {
				setPickerState(CLOSED_STATE);
				return;
			}
			const resolved = resolvePickerState(value, cursor);
			const pickerInfo = resolved.atState ?? resolved.slashState;

			if (!pickerInfo) {
				setPickerState(CLOSED_STATE);
				return;
			}

			const nextMode: PickerMode = resolved.atState ? "at" : "slash";
			const endIndex = resolved.atState
				? resolved.atState.endIndex
				: pickerInfo.startIndex + 1 + pickerInfo.query.length;

			setPickerState((prev) => {
				const modeChanged = prev.mode !== nextMode;
				const queryChanged = prev.query !== pickerInfo.query;
				const resetActive = modeChanged || queryChanged;
				return {
					mode: nextMode,
					query: pickerInfo.query,
					startIndex: pickerInfo.startIndex,
					endIndex,
					activeIndex: resetActive ? 0 : prev.activeIndex,
				};
			});
		},
		[],
	);

	const applyPickerSelection = useCallback(
		(item: CommandPickerItem): void => {
			const el =
				inputRef && "current" in inputRef ? inputRef.current : null;
			const draft = store.getState().ui.taskDraft;
			const cursor = el?.selectionStart ?? draft.length;
			const currentState = pickerStateRef.current;
			const { nextText, cursorPos } = buildPickerInsert(
				draft,
				cursor,
				currentState.startIndex,
				item.insertText,
				currentState.mode === "at" ? currentState.endIndex : undefined,
			);
			store.getState().setTaskDraft(nextText);
			setPickerState(CLOSED_STATE);
			requestAnimationFrame(() => {
				if (!el) return;
				el.focus();
				el.setSelectionRange(cursorPos, cursorPos);
			});
		},
		[inputRef, store],
	);

	const dismissPicker = useCallback((): void => {
		setPickerState(CLOSED_STATE);
	}, []);

	const setActiveIndex = useCallback((index: number): void => {
		setPickerState((prev) => ({ ...prev, activeIndex: index }));
	}, []);

	const handlePickerKeyDown = useCallback(
		(e: KeyboardEvent): boolean => {
			if (!isPickerOpen) return false;
			const items = pickerItemsRef.current;
			const currentState = pickerStateRef.current;
			if (e.key === "ArrowDown" || (e.key === "Tab" && e.shiftKey)) {
				if (items.length === 0) return false;
				e.preventDefault();
				const next = Math.min(currentState.activeIndex + 1, items.length - 1);
				setPickerState((prev) => ({ ...prev, activeIndex: next }));
				return true;
			}
			if (e.key === "ArrowUp") {
				if (items.length === 0) return false;
				e.preventDefault();
				setPickerState((prev) => ({
					...prev,
					activeIndex: Math.max(prev.activeIndex - 1, 0),
				}));
				return true;
			}
			if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
				if (items.length === 0) return false;
				e.preventDefault();
				const item = items[currentState.activeIndex];
				if (item) applyPickerSelection(item);
				return true;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				dismissPicker();
				return true;
			}
			return false;
		},
		[isPickerOpen, applyPickerSelection, dismissPicker],
	);

	return {
		isPickerOpen,
		pickerItems,
		activeIndex: pickerState.activeIndex,
		emptyMessage,
		refreshPickerState,
		applyPickerSelection,
		dismissPicker,
		setActiveIndex,
		loadSkills,
		handlePickerKeyDown,
	};
}
