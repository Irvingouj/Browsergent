import type { FsClient } from "../../skills/skill-types";
import type { FileNode } from "../../state/slices/files-slice";
import { buildDirectoryNode, buildFileNode } from "./node-builders";
import { joinChildPath } from "./paths";

/** Discriminated entry kind so the consumer switches exhaustively. */
type ListedChild =
	| { kind: "file"; name: string; path: string; parentId?: string }
	| { kind: "directory"; name: string; path: string; parentId?: string };

function toListedChild(
	entry: { name: string; kind: string },
	root: string,
	parentId?: string,
): ListedChild | null {
	const path = joinChildPath(root, entry.name);
	const base = { name: entry.name, path, ...(parentId !== undefined ? { parentId } : {}) };
	return entry.kind === "directory"
		? { kind: "directory", ...base }
		: entry.kind === "file"
			? { kind: "file", ...base }
			: null;
}

/** Stat a file node to populate size/mime; tolerate stat failures (leaves fields unset). */
async function fillStat(
	fs: FsClient,
	node: FileNode,
): Promise<FileNode> {
	try {
		const { size, mime } = await fs.stat(node.path);
		const next: FileNode = { ...node, size };
		return mime === null ? next : { ...next, mime: mime ?? undefined };
	} catch {
		return node;
	}
}

/** List every node under the whole FS tree, recursing into directories. */
export async function listAllFiles(fs: FsClient): Promise<FileNode[]> {
	return scanRecursive(fs, "/", undefined);
}

/** List only the direct children of a directory (no recursion). */
export async function listDirectChildren(
	fs: FsClient,
	dirPath: string,
): Promise<FileNode[]> {
	let entries;
	try {
		({ entries } = await fs.list(dirPath));
	} catch {
		return [];
	}
	const out: FileNode[] = [];
	for (const raw of entries) {
		const child = toListedChild(raw, dirPath);
		if (child === null) continue;
		switch (child.kind) {
			case "directory":
				out.push(buildDirectoryNode({ name: child.name, path: child.path }));
				break;
			case "file": {
				const base = buildFileNode({ name: child.name, path: child.path });
				out.push(await fillStat(fs, base));
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
): Promise<FileNode[]> {
	let entries;
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
				out.push(...(await scanRecursive(fs, child.path, child.path)));
				break;
			case "file": {
				const base = buildFileNode({
					name: child.name,
					path: child.path,
					parentId,
				});
				out.push(await fillStat(fs, base));
				break;
			}
		}
	}
	return out;
}
