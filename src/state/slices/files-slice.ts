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

export interface FilesState {
	nodes: Record<FileNodeId, FileNode>;
	rootIds: FileNodeId[];
	selectedFileId: FileNodeId | null;
	filesVersion: number;
}

export interface FilesSlice {
	files: FilesState;
	setSelectedFileId(id: FileNodeId | null): void;
	addFileNode(node: FileNode): void;
	removeFileNode(id: FileNodeId): void;
	clearFiles(): void;
	setFileNodes(nodes: FileNode[]): void;
	incrementFilesVersion(): void;
}

function buildFileState(nodes: FileNode[]): Pick<FilesState, "nodes" | "rootIds"> {
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

export function createFilesSlice(
	set: StoreApi<BrowsergentStore>["setState"],
): FilesSlice {
	return {
		files: {
			nodes: {},
			rootIds: [],
			selectedFileId: null,
			filesVersion: 0,
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
				return { files: { ...state.files, nodes, rootIds } };
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
				},
			}));
		},
		setFileNodes(nodes) {
			set((state) => ({
				files: {
					...state.files,
					...buildFileState(nodes),
					selectedFileId: null,
				},
			}));
		},
		incrementFilesVersion() {
			set((state) => ({
				files: { ...state.files, filesVersion: state.files.filesVersion + 1 },
			}));
		},
	};
}
