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
					onClick={onStop}
					class="px-md py-sm rounded-full font-sans text-sm font-semibold cursor-pointer transition-all flex items-center gap-xs whitespace-nowrap min-h-[36px] bg-danger-soft text-danger border border-danger hover:bg-danger-soft hover:"
				>
					<span class="w-1.5 h-1.5 rounded-full bg-danger" />
					Stop
				</button>
			) : (
				<button
					type="button"
					onClick={onRun}
					class="px-md py-sm rounded-full font-sans text-sm font-semibold cursor-pointer transition-all whitespace-nowrap min-h-[36px] bg-text-primary text-bg-base hover:bg-text-secondary active:bg-text-muted"
				>
					Run
				</button>
			)}
		</div>
	);
};
