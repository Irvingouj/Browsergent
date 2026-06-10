import type { FunctionalComponent, Ref } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { useStore } from "zustand/react";
import { getSkillService } from "../../skills/skill-service";
import type { SkillMeta } from "../../skills/skill-types";
import { selectFilesState, selectTaskDraft } from "../../state/selectors";
import { browsergentStore } from "../../state/store";
import {
	CommandPicker,
	type CommandPickerItem,
	filterPickerItems,
} from "./CommandPicker";
import {
	filesToPickerItems,
	type AtState,
	type SlashState,
	resolvePickerState,
	buildPickerInsert,
} from "../detect-mention-state";

interface InputBarProps {
	isRunning: boolean;
	onRun: () => void;
	onStop: () => void;
	inputRef?: Ref<HTMLInputElement>;
}

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

export const InputBar: FunctionalComponent<InputBarProps> = ({
	isRunning,
	onRun,
	onStop,
	inputRef,
}) => {
	const taskInput = useStore(browsergentStore, selectTaskDraft);
	const filesState = useStore(browsergentStore, selectFilesState);
	const [skills, setSkills] = useState<SkillMeta[]>([]);
	const [slashState, setSlashState] = useState<SlashState | null>(null);
	const [atState, setAtState] = useState<AtState | null>(null);
	const [activeIndex, setActiveIndex] = useState(0);

	const loadSkills = useCallback(() => {
		getSkillService()
			.listSkills()
			.then(setSkills)
			.catch((err: unknown) => {
				console.warn("Failed to load skills for picker:", err);
			});
	}, []);

	useEffect(() => {
		loadSkills();
		const unsubscribe = getSkillService().subscribeSkillsChanged(setSkills);
		return unsubscribe;
	}, [loadSkills]);

	const skillPickerItems = useMemo(() => skillsToPickerItems(skills), [skills]);
	const filteredSkillItems = useMemo(
		() => (slashState ? filterPickerItems(skillPickerItems, slashState.query) : []),
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

	const refreshPickerState = useCallback(
		(value: string, cursor: number | null) => {
			if (cursor === null) {
				setSlashState(null);
				setAtState(null);
				return;
			}
			const { atState: at, slashState: slash } = resolvePickerState(value, cursor);
			setAtState(at);
			setSlashState(slash);
		},
		[],
	);

	const applyPickerSelection = useCallback(
		(item: CommandPickerItem) => {
			const pickerState = atState ?? slashState;
			if (!pickerState) return;
			const el = inputRef && "current" in inputRef ? inputRef.current : null;
			const cursor = el?.selectionStart ?? taskInput.length;
			const { nextText, cursorPos } = buildPickerInsert(
				taskInput,
				cursor,
				pickerState.startIndex,
				item.insertText,
				atState?.endIndex,
			);
			browsergentStore.getState().setTaskDraft(nextText);
			if (atState) {
				setAtState(null);
			} else {
				setSlashState(null);
			}
			setActiveIndex(0);
			requestAnimationFrame(() => {
				if (!el) return;
				el.focus();
				el.setSelectionRange(cursorPos, cursorPos);
			});
		},
		[atState, slashState, taskInput, inputRef],
	);

	const isPickerOpen = atState !== null || slashState !== null;
	const pickerItems = atState !== null ? filteredFileItems : filteredSkillItems;
	const dismissPicker = atState !== null ? () => setAtState(null) : () => setSlashState(null);
	const emptyMessage = atState !== null ? "No matching files" : "No matching skills";

	return (
		<div class="relative z-10 px-md py-sm bg-bg-surface border-t border-border flex gap-sm items-end">
			<div class="relative flex-1">
				{isPickerOpen ? (
					<CommandPicker
						items={pickerItems}
						activeIndex={activeIndex}
						onSelect={applyPickerSelection}
						onActiveIndexChange={setActiveIndex}
						onDismiss={dismissPicker}
						emptyMessage={emptyMessage}
					/>
				) : null}
				<input
					ref={inputRef}
					type="text"
					data-testid="task-input"
					value={taskInput}
					onInput={(e) => {
						const el = e.target as HTMLInputElement;
						browsergentStore.getState().setTaskDraft(el.value);
						refreshPickerState(el.value, el.selectionStart);
						setActiveIndex(0);
					}}
					onFocus={() => {
						loadSkills();
					}}
					onClick={(e) => {
						const el = e.target as HTMLInputElement;
						refreshPickerState(el.value, el.selectionStart);
					}}
					onKeyUp={(e) => {
						const el = e.target as HTMLInputElement;
						refreshPickerState(el.value, el.selectionStart);
					}}
					onKeyDown={(e) => {
						if (isPickerOpen && pickerItems.length > 0) {
							if (e.key === "ArrowDown") {
								e.preventDefault();
								setActiveIndex((i) =>
									Math.min(i + 1, pickerItems.length - 1),
								);
								return;
							}
							if (e.key === "ArrowUp") {
								e.preventDefault();
								setActiveIndex((i) => Math.max(i - 1, 0));
								return;
							}
							if (e.key === "Enter") {
								e.preventDefault();
								const item = pickerItems[activeIndex];
								if (item) applyPickerSelection(item);
								return;
							}
							if (e.key === "Escape") {
								e.preventDefault();
								dismissPicker();
								return;
							}
						}
						if (e.key === "Enter" && !isRunning) onRun();
					}}
					placeholder="Type a task... (/ for skills, @ for files)"
					disabled={isRunning}
					class="w-full bg-bg-base border border-border-strong rounded-md px-md py-sm text-text-primary font-sans text-sm outline-none transition-all min-h-[36px] focus:border-accent focus:ring-[3px] focus:ring-accent-soft placeholder:text-text-dim disabled:opacity-50 disabled:cursor-not-allowed"
				/>
			</div>
			{isRunning ? (
				<button
					type="button"
					data-testid="stop-button"
					aria-label="Stop agent"
					onClick={onStop}
					class="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all bg-danger-soft text-danger border border-danger hover:bg-danger-soft"
				>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
						<rect x="3" y="3" width="10" height="10" rx="1.5" />
					</svg>
				</button>
			) : (
				<button
					type="button"
					data-testid="run-button"
					aria-label="Run task"
					onClick={onRun}
					class="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all bg-text-primary text-bg-base hover:bg-text-secondary active:bg-text-muted"
				>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
						<path d="M4 2.5v11l9-5.5-9-5.5z" />
					</svg>
				</button>
			)}
		</div>
	);
};
