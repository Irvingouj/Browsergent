import type { FunctionalComponent } from "preact";
import { useStore } from "zustand/react";
import { selectTaskDraft } from "../../state/selectors";
import { browsergentStore } from "../../state/store";

interface InputBarProps {
	isRunning: boolean;
	onRun: () => void;
	onStop: () => void;
}

export const InputBar: FunctionalComponent<InputBarProps> = ({
	isRunning,
	onRun,
	onStop,
}) => {
	const taskInput = useStore(browsergentStore, selectTaskDraft);

	return (
		<div class="relative z-10 px-md py-sm bg-bg-surface border-t border-border flex gap-sm items-end">
			<input
				type="text"
				value={taskInput}
				onInput={(e) =>
					browsergentStore
						.getState()
						.setTaskDraft((e.target as HTMLInputElement).value)
				}
				onKeyDown={(e) => {
					if (e.key === "Enter" && !isRunning) onRun();
				}}
				placeholder="Type a task..."
				disabled={isRunning}
				class="flex-1 bg-bg-base border border-border-strong rounded-md px-md py-sm text-text-primary font-sans text-sm outline-none transition-all min-h-[36px] focus:border-accent focus:ring-[3px] focus:ring-accent-soft placeholder:text-text-dim disabled:opacity-50 disabled:cursor-not-allowed"
			/>
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
