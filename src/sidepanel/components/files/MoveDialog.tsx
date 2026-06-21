import { useStore } from "zustand";
import { browsergentStore } from "../../../state/store";
import { selectMovePromptTarget, selectMovePromptValue } from "../../../state/selectors";

interface MoveDialogProps {
	onMove: (id: string, targetDir: string) => Promise<void>;
}

export const MoveDialog = ({ onMove }: MoveDialogProps) => {
	const movePromptTarget = useStore(browsergentStore, selectMovePromptTarget);
	const movePromptValue = useStore(browsergentStore, selectMovePromptValue);
	if (movePromptTarget === null) return null;
	const node = browsergentStore.getState().files.nodes[movePromptTarget];
	if (!node) return null;

	const submit = (): void => {
		void onMove(movePromptTarget, movePromptValue.trim());
		browsergentStore.getState().closeMovePrompt();
	};

	return (
		<div
			data-testid="move-target-input"
			class="fixed z-50 bg-bg-surface-solid border border-border rounded-md shadow-lg p-sm min-w-[200px]"
			style={{ left: "50%", top: "30%", transform: "translate(-50%, -50%)" }}
		>
			<p class="text-xs text-text-secondary mb-xs">
				Move <span class="font-medium text-text-primary">{node.name}</span> to:
			</p>
			<input
				type="text"
				value={movePromptValue}
				onInput={(e) =>
					browsergentStore.getState().setMovePromptValue(e.currentTarget.value)
				}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						submit();
					} else if (e.key === "Escape") {
						browsergentStore.getState().closeMovePrompt();
					}
				}}
				placeholder="e.g. /docs or / (root)"
				class="w-full px-sm py-xs text-xs bg-bg-surface border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
				autoFocus
			/>
			<p class="text-[10px] text-text-muted mt-xs">
				Enter target directory path. Enter to confirm, Esc to cancel.
			</p>
		</div>
	);
};
