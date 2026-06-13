import { isTextFile } from "../controllers/files-utils";
import type { FilesController } from "../controllers/files-controller";
import type { FileNode } from "../state/slices/files-slice";
import type {
	FileOp,
	FileOpListEntry,
	FileOpResult,
} from "../worker/file-op-relay";

const FILE_NOT_FOUND = "File not found in session: ";
const FILE_BINARY = "File is binary, cannot read/edit as text: ";

function isUnsafeName(name: string): boolean {
	if (!name) return true;
	if (name.includes("..")) return true;
	if (name.startsWith("/")) return true;
	if (name.includes("\\")) return true;
	if (name.includes("\0")) return true;
	return false;
}

async function findFileEntry(
	filesController: FilesController,
	sessionId: string,
	name: string,
): Promise<{ id: string; isText: boolean; name: string } | null> {
	const nodes = await filesController.listSessionFiles(sessionId);
	const match = nodes.find((n: FileNode) => n.name === name);
	if (!match) return null;
	return { id: match.id, isText: isTextFile(match.name), name: match.name };
}

export async function handleFileOp(
	msg: { id: string; sessionId: string; op: FileOp },
	filesController: FilesController,
): Promise<FileOpResult> {
	const { sessionId, op } = msg;

	switch (op.op) {
		case "list": {
			const nodes = await filesController.listSessionFiles(sessionId);
			const prefix = op.prefix ?? "";
			const filtered = prefix
				? nodes.filter((n) => n.name.startsWith(prefix))
				: nodes;
			const files: FileOpListEntry[] = filtered.map((n) => ({
				id: n.id,
				name: n.name,
				size: n.size ?? 0,
				mime: n.mime ?? "application/octet-stream",
				isText: isTextFile(n.name),
			}));
			return { op: "list", files };
		}
		case "read": {
			if (isUnsafeName(op.path)) {
				throw new Error(`File path out of scope: ${op.path}`);
			}
			const entry = await findFileEntry(filesController, sessionId, op.path);
			if (!entry) throw new Error(FILE_NOT_FOUND + op.path);
			if (!entry.isText) throw new Error(FILE_BINARY + op.path);
			const content = await filesController.readFileText(sessionId, entry.id);
			return {
				op: "read",
				content,
				bytes: content.length,
				truncated: false,
			};
		}
		case "edit": {
			if (isUnsafeName(op.path)) {
				throw new Error(`File path out of scope: ${op.path}`);
			}
			const entry = await findFileEntry(filesController, sessionId, op.path);
			if (!entry) throw new Error(FILE_NOT_FOUND + op.path);
			if (!entry.isText) throw new Error(FILE_BINARY + op.path);
			const result = await filesController.editFile(
				sessionId,
				entry.id,
				op.oldString,
				op.newString,
				op.replaceAll ?? false,
			);
			return { op: "edit", occurrences: result.occurrences, bytes: result.bytes };
		}
		case "delete": {
			if (isUnsafeName(op.path)) {
				throw new Error(`File path out of scope: ${op.path}`);
			}
			const entry = await findFileEntry(filesController, sessionId, op.path);
			if (!entry) throw new Error(FILE_NOT_FOUND + op.path);
			await filesController.deleteFile(sessionId, entry.id);
			return { op: "delete" };
		}
	}
}

