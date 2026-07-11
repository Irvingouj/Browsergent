import type { StoreApi } from "zustand/vanilla";
import type { BrowsergentStore } from "../store";

export type FileNodeId = string;

export type FileNodeKind = "file" | "directory";

export interface FileNode {
	id: FileNodeId;
	name: string;
	path: string;
	kind: FileNodeKind;
	parentId?: FileNodeId;
	size?: number;
	mime?: string;
}

export function isFileNode(value: unknown): value is FileNode {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.id === "string" &&
		typeof v.name === "string" &&
		typeof v.path === "string" &&
		(v.kind === "file" || v.kind === "directory") &&
		(v.parentId === undefined || typeof v.parentId === "string") &&
		(v.size === undefined || typeof v.size === "number") &&
		(v.mime === undefined || typeof v.mime === "string")
	);
}

export type CreatingKind = "folder" | "file" | null;

export interface ContextMenuState {
	nodeId: FileNodeId;
	x: number;
	y: number;
}

/** Path key for the OPFS root when tracking which directories have been listed. */
export const ROOT_DIR_PATH = "/";

export interface FilesState {
	nodes: Record<FileNodeId, FileNode>;
	rootIds: FileNodeId[];
	selectedFileId: FileNodeId | null;
	filesVersion: number;
	expandedFolderIds: FileNodeId[];
	/** Directory paths whose direct children have been loaded into `nodes`. Includes `"/"`. */
	loadedDirPaths: FileNodeId[];
	creatingKind: CreatingKind;
	creatingName: string;
	creatingParentPath: string;
	contextMenu: ContextMenuState | null;
	movePromptTarget: FileNodeId | null;
	movePromptValue: string;
	renamingNodeId: FileNodeId | null;
}

export interface FilesSlice {
	files: FilesState;
	setSelectedFileId(id: FileNodeId | null): void;
	addFileNode(node: FileNode): void;
	removeFileNode(id: FileNodeId): void;
	clearFiles(): void;
	setFileNodes(nodes: FileNode[]): void;
	/**
	 * Replace only the direct children of one directory, leaving other branches intact.
	 * `parentPath` is `null` (or `ROOT_DIR_PATH`) for the OPFS root.
	 * Marks the directory as loaded.
	 */
	setDirectoryChildren(
		parentPath: FileNodeId | null,
		children: FileNode[],
	): void;
	incrementFilesVersion(): void;
	toggleFolderExpanded(id: FileNodeId): void;
	moveNode(
		id: FileNodeId,
		newParentId: FileNodeId | undefined,
		newName: string,
		newPath: string,
	): void;
	renameNode(id: FileNodeId, newName: string, newPath: string): void;
	startCreating(kind: CreatingKind, parentPath: string): void;
	setCreatingName(name: string): void;
	cancelCreating(): void;
	openContextMenu(nodeId: FileNodeId, x: number, y: number): void;
	closeContextMenu(): void;
	openMovePrompt(nodeId: FileNodeId): void;
	setMovePromptValue(value: string): void;
	closeMovePrompt(): void;
	startRenaming(id: FileNodeId): void;
	cancelRenaming(): void;
}

function buildFileState(
	nodes: FileNode[],
): Pick<FilesState, "nodes" | "rootIds"> {
	const nodesRecord: Record<FileNodeId, FileNode> = {};
	const rootIds: FileNodeId[] = [];
	for (const node of nodes) {
		nodesRecord[node.id] = node;
		if (node.parentId === undefined) {
			rootIds.push(node.id);
		}
	}
	return { nodes: nodesRecord, rootIds };
}

/** Remove a node and every path under it from the map (mutates `nodes`). */
function removeNodeAndDescendants(
	nodes: Record<FileNodeId, FileNode>,
	id: FileNodeId,
): void {
	delete nodes[id];
	const prefix = `${id}/`;
	for (const key of Object.keys(nodes)) {
		if (key.startsWith(prefix)) delete nodes[key];
	}
}

function isRootParent(parentPath: FileNodeId | null): boolean {
	return parentPath === null || parentPath === ROOT_DIR_PATH;
}

function loadKeyForParent(parentPath: FileNodeId | null): FileNodeId {
	if (parentPath === null || parentPath === ROOT_DIR_PATH) return ROOT_DIR_PATH;
	return parentPath;
}

/** Paths that were loaded under any of the removed direct children are stale. */
function pruneLoadedDirPaths(
	loadedDirPaths: readonly FileNodeId[],
	oldChildIds: readonly FileNodeId[],
	loadKey: FileNodeId,
): FileNodeId[] {
	const next = loadedDirPaths.filter((p) => {
		if (p === loadKey) return true;
		for (const oldId of oldChildIds) {
			if (p === oldId || p.startsWith(`${oldId}/`)) return false;
		}
		return true;
	});
	if (!next.includes(loadKey)) next.push(loadKey);
	return next;
}

/** When a full tree is set at once, treat every directory (and root) as loaded. */
function loadedPathsFromFullTree(nodes: FileNode[]): FileNodeId[] {
	const paths: FileNodeId[] = [ROOT_DIR_PATH];
	for (const node of nodes) {
		if (node.kind === "directory") paths.push(node.id);
	}
	return paths;
}

function updateDescendants(
	nodes: Record<FileNodeId, FileNode>,
	oldPath: string,
	newPath: string,
): Record<FileNodeId, FileNode> {
	const prefix = `${oldPath}/`;
	const updated: Record<FileNodeId, FileNode> = {};
	for (const key of Object.keys(nodes)) {
		const node = nodes[key];
		if (!node) continue;
		if (key === oldPath) continue;
		if (key.startsWith(prefix)) {
			const relative = key.slice(oldPath.length);
			const newKey = newPath + relative;
			let newParentId = node.parentId;
			if (newParentId !== undefined) {
				if (newParentId === oldPath) {
					newParentId = newPath;
				} else if (newParentId.startsWith(prefix)) {
					newParentId = newPath + newParentId.slice(oldPath.length);
				}
			}
			updated[newKey] = {
				...node,
				id: newKey,
				path: newKey,
				...(newParentId !== undefined ? { parentId: newParentId } : {}),
			};
		} else {
			updated[key] = node;
		}
	}
	return updated;
}

export function createFilesSlice(
	set: StoreApi<BrowsergentStore>["setState"],
): FilesSlice {
	return {
		files: {
			nodes: {},
			rootIds: [],
			selectedFileId: null,
			filesVersion: 0,
			expandedFolderIds: [],
			loadedDirPaths: [],
			creatingKind: null,
			creatingName: "",
			creatingParentPath: "",
			contextMenu: null,
			movePromptTarget: null,
			movePromptValue: "",
			renamingNodeId: null,
		},
		setSelectedFileId(id) {
			set((state) => ({
				files: { ...state.files, selectedFileId: id },
			}));
		},
		addFileNode(node) {
			set((state) => {
				const nodes = { ...state.files.nodes, [node.id]: node };
				const rootIds =
					node.parentId === undefined
						? [...state.files.rootIds, node.id]
						: state.files.rootIds;
				return {
					files: {
						...state.files,
						nodes,
						rootIds,
						filesVersion: state.files.filesVersion + 1,
					},
				};
			});
		},
		removeFileNode(id) {
			set((state) => {
				const nodes = { ...state.files.nodes };
				delete nodes[id];
				const rootIds = state.files.rootIds.filter((rid) => rid !== id);
				const selectedFileId =
					state.files.selectedFileId === id ? null : state.files.selectedFileId;
				return {
					files: {
						...state.files,
						nodes,
						rootIds,
						selectedFileId,
						filesVersion: state.files.filesVersion + 1,
					},
				};
			});
		},
		clearFiles() {
			set((state) => ({
				files: {
					...state.files,
					nodes: {},
					rootIds: [],
					selectedFileId: null,
					expandedFolderIds: [],
					loadedDirPaths: [],
					filesVersion: state.files.filesVersion + 1,
				},
			}));
		},
		setFileNodes(nodes) {
			const next = buildFileState(nodes);
			set((state) => {
				// Only clear selection if its node is gone; otherwise preserve it so
				// the preview keeps its content while the tree refreshes.
				const selectedFileId =
					state.files.selectedFileId &&
					Object.hasOwn(next.nodes, state.files.selectedFileId)
						? state.files.selectedFileId
						: null;
				return {
					files: {
						...state.files,
						...next,
						selectedFileId,
						loadedDirPaths: loadedPathsFromFullTree(nodes),
						filesVersion: state.files.filesVersion + 1,
					},
				};
			});
		},
		setDirectoryChildren(parentPath, children) {
			set((state) => {
				const loadKey = loadKeyForParent(parentPath);
				const isRoot = isRootParent(parentPath);
				const nodes: Record<FileNodeId, FileNode> = { ...state.files.nodes };

				const oldChildIds: FileNodeId[] = [];
				for (const node of Object.values(nodes)) {
					if (!node) continue;
					const isDirectChild = isRoot
						? node.parentId === undefined
						: node.parentId === parentPath;
					if (isDirectChild) oldChildIds.push(node.id);
				}
				for (const id of oldChildIds) {
					removeNodeAndDescendants(nodes, id);
				}
				for (const child of children) {
					nodes[child.id] = child;
				}

				const rootIds = isRoot
					? children.map((c) => c.id)
					: state.files.rootIds.filter((id) => Object.hasOwn(nodes, id));

				const loadedDirPaths = pruneLoadedDirPaths(
					state.files.loadedDirPaths,
					oldChildIds,
					loadKey,
				);

				const selectedFileId =
					state.files.selectedFileId &&
					Object.hasOwn(nodes, state.files.selectedFileId)
						? state.files.selectedFileId
						: null;

				const expandedFolderIds = state.files.expandedFolderIds.filter((id) =>
					Object.hasOwn(nodes, id),
				);

				return {
					files: {
						...state.files,
						nodes,
						rootIds,
						loadedDirPaths,
						selectedFileId,
						expandedFolderIds,
						filesVersion: state.files.filesVersion + 1,
					},
				};
			});
		},
		incrementFilesVersion() {
			set((state) => ({
				files: { ...state.files, filesVersion: state.files.filesVersion + 1 },
			}));
		},
		toggleFolderExpanded(id) {
			set((state) => {
				const expandedFolderIds = state.files.expandedFolderIds.includes(id)
					? state.files.expandedFolderIds.filter((x) => x !== id)
					: [...state.files.expandedFolderIds, id];
				return { files: { ...state.files, expandedFolderIds } };
			});
		},
		moveNode(id, newParentId, newName, newPath) {
			set((state) => {
				const existing = state.files.nodes[id];
				if (!existing) return state;
				const oldPath = existing.path;
				let nodes = { ...state.files.nodes };
				delete nodes[id];
				if (existing.kind === "directory") {
					nodes = updateDescendants(nodes, oldPath, newPath);
				}
				const nextNode: FileNode = {
					...existing,
					id: newPath,
					path: newPath,
					name: newName,
					// Explicit override: clearing to undefined when moving to root,
					// otherwise ...existing would leak the stale parentId.
					parentId: newParentId,
				};
				nodes[newPath] = nextNode;
				let rootIds: FileNodeId[];
				if (newParentId === undefined) {
					rootIds = state.files.rootIds.includes(id)
						? [...state.files.rootIds.filter((r) => r !== id), newPath]
						: [...state.files.rootIds, newPath];
				} else {
					rootIds = state.files.rootIds.filter((r) => r !== id);
				}
				const selectedFileId =
					state.files.selectedFileId === id
						? newPath
						: state.files.selectedFileId;
				return {
					files: {
						...state.files,
						nodes,
						rootIds,
						filesVersion: state.files.filesVersion + 1,
						selectedFileId,
					},
				};
			});
		},
		renameNode(id, newName, newPath) {
			set((state) => {
				const existing = state.files.nodes[id];
				if (!existing) return state;
				const oldPath = existing.path;
				let nodes = { ...state.files.nodes };
				delete nodes[id];
				if (existing.kind === "directory") {
					nodes = updateDescendants(nodes, oldPath, newPath);
				}
				nodes[newPath] = {
					...existing,
					id: newPath,
					path: newPath,
					name: newName,
				};
				const rootIds = state.files.rootIds.includes(id)
					? [...state.files.rootIds.filter((r) => r !== id), newPath]
					: state.files.rootIds;
				const selectedFileId =
					state.files.selectedFileId === id
						? newPath
						: state.files.selectedFileId;
				return {
					files: {
						...state.files,
						nodes,
						rootIds,
						filesVersion: state.files.filesVersion + 1,
						selectedFileId,
					},
				};
			});
		},
		startCreating(kind, parentPath) {
			set((state) => ({
				files: {
					...state.files,
					creatingKind: kind,
					creatingName: "",
					creatingParentPath: parentPath,
				},
			}));
		},
		setCreatingName(name) {
			set((state) => ({ files: { ...state.files, creatingName: name } }));
		},
		cancelCreating() {
			set((state) => ({
				files: {
					...state.files,
					creatingKind: null,
					creatingName: "",
					creatingParentPath: "",
				},
			}));
		},
		openContextMenu(nodeId, x, y) {
			set((state) => ({
				files: { ...state.files, contextMenu: { nodeId, x, y } },
			}));
		},
		closeContextMenu() {
			set((state) => ({ files: { ...state.files, contextMenu: null } }));
		},
		openMovePrompt(nodeId) {
			set((state) => ({
				files: {
					...state.files,
					movePromptTarget: nodeId,
					movePromptValue: "",
					contextMenu: null,
				},
			}));
		},
		setMovePromptValue(value) {
			set((state) => ({ files: { ...state.files, movePromptValue: value } }));
		},
		closeMovePrompt() {
			set((state) => ({
				files: {
					...state.files,
					movePromptTarget: null,
					movePromptValue: "",
				},
			}));
		},
		startRenaming(id) {
			set((state) => ({ files: { ...state.files, renamingNodeId: id } }));
		},
		cancelRenaming() {
			set((state) => ({ files: { ...state.files, renamingNodeId: null } }));
		},
	};
}
