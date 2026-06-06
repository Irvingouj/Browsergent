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
		<div
			style={{
				padding: "8px 12px",
				borderTop: "1px solid #e0e0e0",
				display: "flex",
				gap: "8px",
			}}
		>
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
				style={{
					flex: 1,
					padding: "6px 8px",
					border: "1px solid #ccc",
					borderRadius: "4px",
				}}
			/>
			{isRunning ? (
				<button
					type="button"
					onClick={onStop}
					style={{
						padding: "6px 16px",
						background: "#d94a4a",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: "pointer",
					}}
				>
					Stop
				</button>
			) : (
				<button
					type="button"
					onClick={onRun}
					style={{
						padding: "6px 16px",
						background: "#4a90d9",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: "pointer",
					}}
				>
					Run
				</button>
			)}
		</div>
	);
};
