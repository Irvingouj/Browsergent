import type { FunctionalComponent, Ref } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { useStore } from "zustand/react";
import { getSkillService } from "../../skills/skill-service";
import type { SkillMeta } from "../../skills/skill-types";
import { selectTaskDraft } from "../../state/selectors";
import { browsergentStore } from "../../state/store";
import {
	CommandPicker,
	type CommandPickerItem,
	filterPickerItems,
} from "./CommandPicker";

interface InputBarProps {
	isRunning: boolean;
	onRun: () => void;
	onStop: () => void;
	inputRef?: Ref<HTMLInputElement>;
}

interface SlashState {
	start: number;
	query: string;
}

export function detectSlashState(value: string, cursor: number): SlashState | null {
	const before = value.slice(0, cursor);
	const slashIndex = before.lastIndexOf("/");
	if (slashIndex === -1) return null;
	if (slashIndex > 0 && !/\s/.test(before[slashIndex - 1] ?? "")) {
		return null;
	}
	const token = before.slice(slashIndex);
	if (/\s/.test(token.slice(1))) return null;
	return { start: slashIndex, query: token.slice(1) };
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
	const [skills, setSkills] = useState<SkillMeta[]>([]);
	const [slashState, setSlashState] = useState<SlashState | null>(null);
	const [activeIndex, setActiveIndex] = useState(0);

	useEffect(() => {
		getSkillService()
			.listSkills()
			.then(setSkills)
			.catch((err: unknown) => {
				console.warn("Failed to load skills for picker:", err);
			});
	}, []);

	const pickerItems = useMemo(() => skillsToPickerItems(skills), [skills]);
	const filteredItems = useMemo(
		() => (slashState ? filterPickerItems(pickerItems, slashState.query) : []),
		[pickerItems, slashState],
	);

	const refreshSlashState = useCallback(
		(value: string, cursor: number | null) => {
			if (cursor === null) {
				setSlashState(null);
				return;
			}
			setSlashState(detectSlashState(value, cursor));
		},
		[],
	);

	const applyPickerSelection = useCallback(
		(item: CommandPickerItem) => {
			if (!slashState) return;
			const el = inputRef && "current" in inputRef ? inputRef.current : null;
			const cursor = el?.selectionStart ?? taskInput.length;
			const before = taskInput.slice(0, slashState.start);
			const after = taskInput.slice(cursor);
			const next = `${before}${item.insertText}${after}`;
			browsergentStore.getState().setTaskDraft(next);
			setSlashState(null);
			setActiveIndex(0);
			requestAnimationFrame(() => {
				if (!el) return;
				el.focus();
				const pos = before.length + item.insertText.length;
				el.setSelectionRange(pos, pos);
			});
		},
		[slashState, taskInput, inputRef],
	);

	return (
		<div class="relative z-10 px-md py-sm bg-bg-surface border-t border-border flex gap-sm items-end">
			<div class="relative flex-1">
				{slashState && filteredItems.length > 0 ? (
					<CommandPicker
						items={filteredItems}
						activeIndex={activeIndex}
						onSelect={applyPickerSelection}
						onActiveIndexChange={setActiveIndex}
						onDismiss={() => setSlashState(null)}
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
						refreshSlashState(el.value, el.selectionStart);
						setActiveIndex(0);
					}}
					onClick={(e) => {
						const el = e.target as HTMLInputElement;
						refreshSlashState(el.value, el.selectionStart);
					}}
					onKeyUp={(e) => {
						const el = e.target as HTMLInputElement;
						refreshSlashState(el.value, el.selectionStart);
					}}
					onKeyDown={(e) => {
						if (slashState && filteredItems.length > 0) {
							if (e.key === "ArrowDown") {
								e.preventDefault();
								setActiveIndex((i) =>
									Math.min(i + 1, filteredItems.length - 1),
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
								const item = filteredItems[activeIndex];
								if (item) applyPickerSelection(item);
								return;
							}
							if (e.key === "Escape") {
								e.preventDefault();
								setSlashState(null);
								return;
							}
						}
						if (e.key === "Enter" && !isRunning) onRun();
					}}
					placeholder="Type a task... (/ for skills)"
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
