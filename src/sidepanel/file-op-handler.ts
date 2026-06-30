import type { FilesController } from "../controllers/files";
import { isTextFile } from "../controllers/files";
import type {
	FileOp,
	FileOpListEntry,
	FileOpResult,
} from "../worker/file-op-relay";

const FILE_NOT_FOUND = "File not found: ";
const FILE_BINARY = "File is binary, cannot read/edit as text: ";

function isUnsafePath(path: string): boolean {
	if (!path) return true;
	if (path.includes("..")) return true;
	if (path.includes("\\")) return true;
	if (path.includes("\0")) return true;
	return false;
}

export async function handleFileOp(
	msg: { id: string; op: FileOp },
	filesController: FilesController,
): Promise<FileOpResult> {
	const { op } = msg;

	switch (op.op) {
		case "list": {
			// Normalize: strip trailing slashes (except root) so "/user/" becomes
			// "/user" and produces clean "/user/a.md" paths, not "/user//a.md".
			const rawPrefix = op.prefix || undefined;
			const prefix =
				rawPrefix && rawPrefix !== "/" && rawPrefix.endsWith("/")
					? rawPrefix.replace(/\/+$/, "")
					: rawPrefix;
			const nodes = prefix
				? await filesController.listDirectChildren(prefix)
				: await filesController.listAllFiles();
			const files: FileOpListEntry[] = nodes.map((n) => ({
				id: n.id,
				name: n.name,
				path: n.path,
				size: n.size ?? 0,
				mime: n.mime ?? "application/octet-stream",
				isText: isTextFile(n.name),
			}));
			return { op: "list", files };
		}
		case "read": {
			if (isUnsafePath(op.path))
				throw new Error(`File path out of scope: ${op.path}`);
			if (!isTextFile(op.path)) throw new Error(FILE_BINARY + op.path);
			try {
				const content = await filesController.readFileText(op.path);
				return { op: "read", content, bytes: content.length, truncated: false };
			} catch {
				throw new Error(FILE_NOT_FOUND + op.path);
			}
		}
		case "write": {
			if (isUnsafePath(op.path))
				throw new Error(`File path out of scope: ${op.path}`);
			await filesController.writeFile(op.path, op.content);
			return { op: "write", bytes: op.content.length };
		}
		case "edit": {
			if (isUnsafePath(op.path))
				throw new Error(`File path out of scope: ${op.path}`);
			if (!isTextFile(op.path)) throw new Error(FILE_BINARY + op.path);
			const result = await filesController.editFile(
				op.path,
				op.oldString,
				op.newString,
				op.replaceAll ?? false,
			);
			return {
				op: "edit",
				occurrences: result.occurrences,
				bytes: result.bytes,
			};
		}
		case "delete": {
			if (isUnsafePath(op.path))
				throw new Error(`File path out of scope: ${op.path}`);
			await filesController.deleteFile(op.path);
			return { op: "delete" };
		}
	}
}
