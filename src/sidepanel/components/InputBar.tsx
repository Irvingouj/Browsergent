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
		<div class="relative z-10 px-md py-sm bg-bg-surface border-t border-white/[0.06] flex gap-sm items-end">
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
				class="flex-1 bg-bg-base border border-white/10 rounded-md px-md py-sm text-text-primary font-sans text-sm outline-none transition-all min-h-[36px] focus:border-accent-cyan focus:ring-[3px] focus:ring-accent-cyan-dim placeholder:text-text-dim disabled:opacity-50 disabled:cursor-not-allowed"
			/>
			{isRunning ? (
				<button
					type="button"
					onClick={onStop}
					class="px-md py-sm rounded-md font-sans text-sm font-semibold cursor-pointer transition-all flex items-center gap-xs whitespace-nowrap min-h-[36px] bg-accent-red/15 text-accent-red border border-accent-red/30 hover:bg-accent-red/25 hover:shadow-[0_0_12px_rgba(248,113,113,0.2)]"
				>
					<span class="w-1.5 h-1.5 rounded-full bg-accent-red" />
					Stop
				</button>
			) : (
				<button
					type="button"
					onClick={onRun}
					class="px-md py-sm rounded-md font-sans text-sm font-semibold cursor-pointer transition-all whitespace-nowrap min-h-[36px] bg-accent-cyan text-bg-base hover:bg-[#67e8f9] hover:shadow-[0_0_20px_rgba(34,211,238,0.15)] active:bg-[#06b6d4]"
				>
					Run
				</button>
			)}
		</div>
	);
};
