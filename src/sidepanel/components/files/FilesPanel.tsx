import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { useStore } from "zustand";
import type { FunctionalComponent } from "preact";
import { browsergentStore } from "../../../state/store";
import {
	selectContextMenu,
	selectExpandedFolderIds,
	selectFilesState,
	selectMovePromptTarget,
	selectRenamingNodeId,
	selectSelectedFileId,
} from "../../../state/selectors";
import type { FilesController } from "../../../controllers/files-controller";
import { findSkillManifest } from "../../../controllers/files-utils";
import { getSkillService } from "../../../skills/skill-service";
import type { FileNode, FileNodeId } from "../../../state/slices/files-slice";
import { FilePreview } from "./FilePreview";
import { FilesToolbar } from "./FilesToolbar";
import { FileTree } from "./FileTree";
import { FileContextMenu } from "./FileContextMenu";
import { MoveDialog } from "./MoveDialog";

interface FilesPanelProps {
	filesController: FilesController;
	onFilesChanged?: () => void;
}

const ROOT_NODE_ID = "root";

function buildChildrenByParent(
	nodes: Record<FileNodeId, FileNode>,
): Map<FileNodeId, FileNode[]> {
	const map = new Map<FileNodeId, FileNode[]>();
	for (const node of Object.values(nodes)) {
		if (!node || node.parentId === undefined) continue;
		const arr = map.get(node.parentId);
		if (arr) arr.push(node);
		else map.set(node.parentId, [node]);
	}
	return map;
}

export const FilesPanel: FunctionalComponent<FilesPanelProps> = ({
	filesController,
	onFilesChanged,
}) => {
	const filesState = useStore(browsergentStore, selectFilesState);
	const selectedFileId = useStore(browsergentStore, selectSelectedFileId);
	const expandedFolderIds = useStore(browsergentStore, selectExpandedFolderIds);
	const renamingNodeId = useStore(browsergentStore, selectRenamingNodeId);
	const contextMenu = useStore(browsergentStore, selectContextMenu);
	const movePromptTarget = useStore(browsergentStore, selectMovePromptTarget);
	const [error, setError] = useState<string | null>(null);
	const [skillImportToast, setSkillImportToast] = useState<string | null>(null);

	const childrenByParent = useMemo(
		() => buildChildrenByParent(filesState.nodes),
		[filesState.nodes],
	);
	const expandedIds = useMemo(
		() => new Set<string>(expandedFolderIds),
		[expandedFolderIds],
	);

	// Mount-load the file tree. Mutations (upload, agent file_write, delete,
	// session switch via refreshFiles) update the store directly through
	// addFileNode/setFileNodes, so we must NOT re-list on filesVersion — that
	// would loop: setFileNodes bumps filesVersion → effect re-fires →
	// setFileNodes again, clearing selection and never letting the preview load.
	useEffect(() => {
		const timer = setTimeout(() => {
			filesController
				.listAllFiles()
				.then((nodes) => browsergentStore.getState().setFileNodes(nodes))
				.catch((err: unknown) => {
					console.warn("Failed to load files:", err);
				});
		}, 0);
		return () => clearTimeout(timer);
	}, [filesController]);

	useEffect(() => {
		if (!error) return;
		const timer = setTimeout(() => setError(null), 5000);
		return () => clearTimeout(timer);
	}, [error]);

	useEffect(() => {
		if (!skillImportToast) return;
		const timer = setTimeout(() => setSkillImportToast(null), 5000);
		return () => clearTimeout(timer);
	}, [skillImportToast]);

	const handleUpload = useCallback(
		async (fileList: FileList | null): Promise<void> => {
			if (!fileList || fileList.length === 0) return;
			const files = Array.from(fileList);
			try {
				if (findSkillManifest(files)) {
					const result = await getSkillService().importUserSkill(files);
					setSkillImportToast(
						`Imported skill: ${result.name} (${result.fileCount} files)`,
					);
					setError(null);
				} else {
					const nodes = await filesController.uploadFiles(files);
					for (const node of nodes) {
						browsergentStore.getState().addFileNode(node);
					}
					onFilesChanged?.();
					setError(null);
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Upload failed");
			}
		},
		[filesController, onFilesChanged],
	);

	// Close menus/dialogs when clicking outside their surfaces.
	useEffect(() => {
		if (!contextMenu && movePromptTarget === null) return;
		const handler = (e: MouseEvent): void => {
			const target = e.target as HTMLElement | null;
			if (
				target?.closest("[data-testid='context-menu']") ||
				target?.closest("[data-testid='move-target-input']") ||
				target?.closest("[data-testid='creating-input']")
			) {
				return;
			}
			browsergentStore.getState().closeContextMenu();
			browsergentStore.getState().closeMovePrompt();
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [contextMenu, movePromptTarget]);

	const toggleExpand = useCallback((id: string) => {
		browsergentStore.getState().toggleFolderExpanded(id);
	}, []);

	const handleFileClick = useCallback((fileId: string) => {
		browsergentStore.getState().setSelectedFileId(fileId);
	}, []);

	const handleDelete = useCallback(
		async (id: FileNodeId): Promise<void> => {
			try {
				const node = browsergentStore.getState().files.nodes[id];
				await (node?.kind === "directory"
					? filesController.deleteFolder(id)
					: filesController.deleteFile(id));
				browsergentStore.getState().removeFileNode(id);
				browsergentStore.getState().incrementFilesVersion();
				onFilesChanged?.();
			} catch (err) {
				setError(err instanceof Error ? err.message : "Delete failed");
			}
		},
		[filesController, onFilesChanged],
	);

	const handleRename = useCallback(
		async (id: FileNodeId, newName: string): Promise<void> => {
			const state = browsergentStore.getState();
			const node = state.files.nodes[id];
			if (!node) return;
			try {
				const newPath = await filesController.rename(node.path, newName);
				state.renameNode(id, newName, newPath);
				onFilesChanged?.();
			} catch (err) {
				setError(err instanceof Error ? err.message : "Rename failed");
			} finally {
				state.cancelRenaming();
			}
		},
		[filesController, onFilesChanged],
	);

	const handleMove = useCallback(
		async (id: FileNodeId, targetDir: string): Promise<void> => {
			const state = browsergentStore.getState();
			const node = state.files.nodes[id];
			if (!node) return;
			const newPath =
				targetDir === "" ? `/${node.name}` : `${targetDir}/${node.name}`;
			try {
				await filesController.move(node.path, newPath);
				state.moveNode(id, targetDir === "" ? undefined : targetDir, node.name, newPath);
				onFilesChanged?.();
			} catch (err) {
				setError(err instanceof Error ? err.message : "Move failed");
			}
		},
		[filesController, onFilesChanged],
	);

	const handleDownload = useCallback(
		async (id: FileNodeId): Promise<void> => {
			const node = browsergentStore.getState().files.nodes[id];
			if (!node || node.kind !== "file") return;
			try {
				const text = await filesController.readFileText(node.path);
				const blob = new Blob([text], { type: "text/plain" });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = node.name;
				a.click();
				URL.revokeObjectURL(url);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Download failed");
			}
		},
		[filesController],
	);

	const openContextMenu = useCallback(
		(nodeId: FileNodeId, x: number, y: number) => {
			browsergentStore.getState().openContextMenu(nodeId, x, y);
		},
		[],
	);

	const selectedNode: FileNode | undefined = selectedFileId
		? filesState.nodes[selectedFileId]
		: undefined;

	return (
		<div data-testid="files-panel" class="flex flex-col h-full">
		<FilesToolbar
			filesController={filesController}
			onFilesChanged={onFilesChanged}
			onUpload={handleUpload}
			onError={setError}
		/>
			<div
				data-dropzone={ROOT_NODE_ID}
				onDragOver={(e) => e.preventDefault()}
			onDrop={(e) => {
				e.preventDefault();
				const files = e.dataTransfer?.files;
				if (files && files.length > 0) {
					void handleUpload(files);
					return;
				}
				const draggedId = e.dataTransfer?.getData("application/x-bg-node");
				if (draggedId) void handleMove(draggedId, "");
			}}
				class="flex-1 overflow-y-auto"
			>
				{filesState.rootIds.length > 0 ? (
					<FileTree
						nodes={filesState.nodes}
						rootIds={filesState.rootIds}
						expandedIds={expandedIds}
						selectedFileId={selectedFileId}
						renamingNodeId={renamingNodeId}
						childrenByParent={childrenByParent}
						onToggle={toggleExpand}
						onSelectFile={handleFileClick}
						onDelete={(id) => void handleDelete(id)}
						onContextMenu={openContextMenu}
						onRename={handleRename}
						onRenameStart={(id) => browsergentStore.getState().startRenaming(id)}
						onRenameCancel={() => browsergentStore.getState().cancelRenaming()}
						onMove={handleMove}
					/>
				) : (
					<div class="flex flex-col items-center justify-center h-full gap-sm text-text-muted">
						<svg width="32" height="32" viewBox="0 0 24 24" fill="none">
							<path
								d="M3 3h7l2 3h9v12a2 2 0 01-2 2H3z"
								stroke="currentColor"
								stroke-width="1"
								fill="none"
							/>
						</svg>
						<p class="text-sm">No files yet</p>
						<p class="text-xs opacity-60">Drag and drop or click Upload</p>
					</div>
				)}
			</div>
			<FileContextMenu
				onRename={(id) => browsergentStore.getState().startRenaming(id)}
				onDownload={handleDownload}
				onDelete={handleDelete}
			/>
			<MoveDialog onMove={handleMove} />
			{selectedNode && selectedNode.kind === "file" && (
				<FilePreview node={selectedNode} filesController={filesController} />
			)}
			{error && (
				<div class="px-sm py-xs text-xs text-danger border-t border-danger-soft bg-danger-soft/30">
					{error}
				</div>
			)}
			{skillImportToast && (
				<div class="px-sm py-xs text-xs text-accent border-t border-accent-soft bg-accent-soft/30">
					{skillImportToast}
				</div>
			)}
		</div>
	);
};
