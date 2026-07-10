import type { FsListEntry } from "@pi-oxide/extension-js";
import type { FsClient } from "../../skills/skill-types";
import type { FileNode } from "../../state/slices/files-slice";
import { buildDirectoryNode, buildFileNode } from "./node-builders";
import { joinChildPath } from "./paths";

/** Discriminated entry kind so the consumer switches exhaustively. */
type ListedChild =
	| { kind: "file"; name: string; path: string; parentId?: string }
	| { kind: "directory"; name: string; path: string; parentId?: string };

export interface ListOptions {
	/** When true, call fs.stat for each file to fill size/mime. Default false. */
	includeStat?: boolean;
}

function toListedChild(
	entry: { name: string; kind: string },
	root: string,
	parentId?: string,
): ListedChild | null {
	const path = joinChildPath(root, entry.name);
	const base = {
		name: entry.name,
		path,
		...(parentId !== undefined ? { parentId } : {}),
	};
	return entry.kind === "directory"
		? { kind: "directory", ...base }
		: entry.kind === "file"
			? { kind: "file", ...base }
			: null;
}

/** Stat a file node to populate size/mime; tolerate stat failures (leaves fields unset). */
async function fillStat(fs: FsClient, node: FileNode): Promise<FileNode> {
	try {
		const { size, mime } = await fs.stat(node.path);
		const next: FileNode = { ...node, size };
		return mime === null ? next : { ...next, mime: mime ?? undefined };
	} catch {
		return node;
	}
}

/** parentId for children of dirPath: root `/` has no parent; subdirs use their path. */
function parentIdForDir(dirPath: string): string | undefined {
	return dirPath === "/" ? undefined : dirPath;
}

/** List every node under the whole FS tree, recursing into directories. */
export async function listAllFiles(
	fs: FsClient,
	options?: ListOptions,
): Promise<FileNode[]> {
	return scanRecursive(fs, "/", undefined, options?.includeStat ?? false);
}

/**
 * List only the direct children of a directory (no recursion).
 * Sets parentId so nodes can be merged into a partial tree.
 * Skips per-file stat by default (size/mime filled on select if needed).
 */
export async function listDirectChildren(
	fs: FsClient,
	dirPath: string,
	options?: ListOptions,
): Promise<FileNode[]> {
	const includeStat = options?.includeStat ?? false;
	const parentId = parentIdForDir(dirPath);
	let entries: FsListEntry[] = [];
	try {
		({ entries } = await fs.list(dirPath));
	} catch {
		return [];
	}
	const out: FileNode[] = [];
	for (const raw of entries) {
		const child = toListedChild(raw, dirPath, parentId);
		if (child === null) continue;
		switch (child.kind) {
			case "directory":
				out.push(
					buildDirectoryNode({
						name: child.name,
						path: child.path,
						parentId,
					}),
				);
				break;
			case "file": {
				const base = buildFileNode({
					name: child.name,
					path: child.path,
					parentId,
				});
				out.push(includeStat ? await fillStat(fs, base) : base);
				break;
			}
		}
	}
	return out;
}

async function scanRecursive(
	fs: FsClient,
	root: string,
	parentId: string | undefined,
	includeStat: boolean,
): Promise<FileNode[]> {
	let entries: FsListEntry[] = [];
	try {
		({ entries } = await fs.list(root));
	} catch {
		return [];
	}
	const out: FileNode[] = [];
	for (const raw of entries) {
		const child = toListedChild(raw, root, parentId);
		if (child === null) continue;
		switch (child.kind) {
			case "directory":
				out.push(
					buildDirectoryNode({
						name: child.name,
						path: child.path,
						parentId,
					}),
				);
				out.push(
					...(await scanRecursive(fs, child.path, child.path, includeStat)),
				);
				break;
			case "file": {
				const base = buildFileNode({
					name: child.name,
					path: child.path,
					parentId,
				});
				out.push(includeStat ? await fillStat(fs, base) : base);
				break;
			}
		}
	}
	return out;
}
