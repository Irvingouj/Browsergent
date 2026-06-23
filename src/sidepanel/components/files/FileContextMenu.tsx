import { useStore } from "zustand";
import { selectContextMenu } from "../../../state/selectors";
import type { FileNodeId } from "../../../state/slices/files-slice";
import { browsergentStore } from "../../../state/store";

interface FileContextMenuProps {
	onRename: (id: FileNodeId) => void;
	onDownload: (id: FileNodeId) => Promise<void>;
	onDelete: (id: FileNodeId) => Promise<void>;
}

export const FileContextMenu = ({
	onRename,
	onDownload,
	onDelete,
}: FileContextMenuProps) => {
	const contextMenu = useStore(browsergentStore, selectContextMenu);
	if (!contextMenu) return null;
	const node = browsergentStore.getState().files.nodes[contextMenu.nodeId];
	if (!node) return null;
	const isDir = node.kind === "directory";
	const isFile = node.kind === "file";

	const startCreateHere = (kind: "folder" | "file"): void => {
		browsergentStore.getState().startCreating(kind, node.path);
		browsergentStore.getState().closeContextMenu();
	};

	return (
		<div
			data-testid="context-menu"
			class="fixed z-50 bg-bg-surface-solid border border-border rounded-md shadow-lg py-xs min-w-[160px]"
			style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
		>
			{isDir && (
				<>
					<button
						type="button"
						class="w-full text-left px-sm py-xs text-xs text-text-secondary hover:bg-bg-hover"
						onClick={() => startCreateHere("folder")}
					>
						New Folder Here
					</button>
					<button
						type="button"
						class="w-full text-left px-sm py-xs text-xs text-text-secondary hover:bg-bg-hover"
						onClick={() => startCreateHere("file")}
					>
						New File Here
					</button>
				</>
			)}
			<button
				type="button"
				class="w-full text-left px-sm py-xs text-xs text-text-secondary hover:bg-bg-hover"
				onClick={() => {
					onRename(contextMenu.nodeId);
					browsergentStore.getState().closeContextMenu();
				}}
			>
				Rename
			</button>
			<button
				type="button"
				class="w-full text-left px-sm py-xs text-xs text-text-secondary hover:bg-bg-hover"
				onClick={() =>
					browsergentStore.getState().openMovePrompt(contextMenu.nodeId)
				}
			>
				Move…
			</button>
			{isFile && (
				<button
					type="button"
					class="w-full text-left px-sm py-xs text-xs text-text-secondary hover:bg-bg-hover"
					onClick={() => {
						void onDownload(contextMenu.nodeId);
						browsergentStore.getState().closeContextMenu();
					}}
				>
					Download
				</button>
			)}
			<button
				type="button"
				class="w-full text-left px-sm py-xs text-xs text-danger hover:bg-danger-soft"
				onClick={() => {
					void onDelete(contextMenu.nodeId);
					browsergentStore.getState().closeContextMenu();
				}}
			>
				Delete
			</button>
		</div>
	);
};
