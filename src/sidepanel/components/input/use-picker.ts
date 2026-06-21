import { useCallback, useEffect, useMemo, useRef } from "preact/hooks";
import type { Ref } from "preact";
import { useStore } from "zustand/react";
import { browsergentStore } from "../../../state/store";
import {
	selectAtPicker,
	selectFilesState,
	selectOpenTabs,
	selectPickerActiveIndex,
	selectSlashPicker,
	selectSkillCatalog,
} from "../../../state/selectors";
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

export interface PickerApi {
	isPickerOpen: boolean;
	pickerItems: CommandPickerItem[];
	activeIndex: number;
	emptyMessage: string;
	refreshPickerState(value: string, cursor: number | null): void;
	applyPickerSelection(item: CommandPickerItem): void;
	dismissPicker(): void;
	loadSkills(): void;
	handlePickerKeyDown(e: KeyboardEvent): boolean;
}

/**
 * Owns the compose picker (skill `/`, file/tab `@`) state. All state lives in
 * ui-slice / skills-slice / files-slice so it stays out of component-local useState.
 */
export function usePicker(inputRef: Ref<HTMLTextAreaElement> | undefined): PickerApi {
	const filesState = useStore(browsergentStore, selectFilesState);
	const skills = useStore(browsergentStore, selectSkillCatalog);
	const atState = useStore(browsergentStore, selectAtPicker);
	const slashState = useStore(browsergentStore, selectSlashPicker);
	const activeIndex = useStore(browsergentStore, selectPickerActiveIndex);
	const openTabs = useStore(browsergentStore, selectOpenTabs);

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
		if (atState === null) return;
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
	}, [atState, store]);

	const skillPickerItems = useMemo(
		() => skillsToPickerItems(skills),
		[skills],
	);
	const filteredSkillItems = useMemo(
		() =>
			slashState ? filterPickerItems(skillPickerItems, slashState.query) : [],
		[skillPickerItems, slashState],
	);
	const filePickerItems = useMemo(
		() => filesToPickerItems(Object.values(filesState.nodes)),
		[filesState.nodes],
	);
	const filteredFileItems = useMemo(
		() => (atState ? filterPickerItems(filePickerItems, atState.query) : []),
		[filePickerItems, atState],
	);
	const tabPickerItems = useMemo(
		() => tabsToPickerItems(openTabs),
		[openTabs],
	);
	const filteredTabItems = useMemo(
		() => (atState ? filterPickerItems(tabPickerItems, atState.query) : []),
		[tabPickerItems, atState],
	);

	const isPickerOpen = atState !== null || slashState !== null;
	const pickerItems =
		atState !== null
			? [...filteredFileItems, ...filteredTabItems]
			: filteredSkillItems;
	pickerItemsRef.current = pickerItems;
	const emptyMessage =
		atState !== null ? "No matching files or tabs" : "No matching skills";

	const refreshPickerState = useCallback(
		(value: string, cursor: number | null): void => {
			if (cursor === null) {
				store.getState().closePicker();
				return;
			}
			const resolved = resolvePickerState(value, cursor);
			store.getState().setAtPicker(resolved.atState);
			store.getState().setSlashPicker(resolved.slashState);
		},
		[store],
	);

	const applyPickerSelection = useCallback(
		(item: CommandPickerItem): void => {
			const pickerState = atState ?? slashState;
			if (!pickerState) return;
			const el =
				inputRef && "current" in inputRef ? inputRef.current : null;
			const draft = store.getState().ui.taskDraft;
			const cursor = el?.selectionStart ?? draft.length;
			const { nextText, cursorPos } = buildPickerInsert(
				draft,
				cursor,
				pickerState.startIndex,
				item.insertText,
				atState?.endIndex,
			);
			store.getState().setTaskDraft(nextText);
			store.getState().closePicker();
			store.getState().setPickerActiveIndex(0);
			requestAnimationFrame(() => {
				if (!el) return;
				el.focus();
				el.setSelectionRange(cursorPos, cursorPos);
			});
		},
		[atState, slashState, inputRef, store],
	);

	const dismissPicker = useCallback((): void => {
		store.getState().closePicker();
	}, [store]);

	const handlePickerKeyDown = useCallback(
		(e: KeyboardEvent): boolean => {
			if (!isPickerOpen) return false;
			const items = pickerItemsRef.current;
			if (e.key === "ArrowDown" || (e.key === "Tab" && e.shiftKey)) {
				if (items.length === 0) return false;
				e.preventDefault();
				const next = Math.min(activeIndex + 1, items.length - 1);
				store.getState().setPickerActiveIndex(next);
				return true;
			}
			if (e.key === "ArrowUp") {
				if (items.length === 0) return false;
				e.preventDefault();
				store.getState().setPickerActiveIndex(Math.max(activeIndex - 1, 0));
				return true;
			}
			if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
				if (items.length === 0) return false;
				e.preventDefault();
				const item = items[activeIndex];
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
		[isPickerOpen, activeIndex, applyPickerSelection, dismissPicker, store],
	);

	return {
		isPickerOpen,
		pickerItems,
		activeIndex,
		emptyMessage,
		refreshPickerState,
		applyPickerSelection,
		dismissPicker,
		loadSkills,
		handlePickerKeyDown,
	};
}
