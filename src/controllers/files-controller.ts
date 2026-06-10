import type { FileNode } from "../state/slices/files-slice";
import type { SkillFsClient } from "../skills/skill-types";
import {
	buildFileNode,
	buildOpfsPath,
	isTextFile,
	sanitizeFileName,
} from "./files-utils";
import type { FilesIndex, FilesIndexEntry } from "./files-utils";
export { isTextFile, sanitizeFileName, buildOpfsPath, buildFileNode } from "./files-utils";
export type { FilesIndex, FilesIndexEntry } from "./files-utils";

const MAX_TEXT_FILE_SIZE = 1_000_000; // 1 MB

function sanitizeSessionId(sessionId: string): string {
	return sessionId.replace(/[\/\\\x00-\x1f\x7f]/g, "").replace(/\.\.+/g, "");
}

export class FilesController {
	private readonly sessionChains = new Map<string, Promise<void>>();

	constructor(private readonly fs: SkillFsClient) {}

	private runSerialized<T>(
		sessionId: string,
		operation: () => Promise<T>,
	): Promise<T> {
		const cleanSessionId = sanitizeSessionId(sessionId);
		const previous = this.sessionChains.get(cleanSessionId) ?? Promise.resolve();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const chain = previous.then(() => gate);
		this.sessionChains.set(cleanSessionId, chain);
		return previous
			.then(() => operation())
			.finally(() => {
				release();
				if (this.sessionChains.get(cleanSessionId) === chain) {
					this.sessionChains.delete(cleanSessionId);
				}
			});
	}

	async uploadFiles(sessionId: string, files: File[]): Promise<FileNode[]> {
		return this.runSerialized(sessionId, () =>
			this.uploadFilesUnlocked(sessionId, files),
		);
	}

	private async uploadFilesUnlocked(
		sessionId: string,
		files: File[],
	): Promise<FileNode[]> {
		const cleanSessionId = sanitizeSessionId(sessionId);
		const index = await this.readIndex(cleanSessionId);
		const nodes: FileNode[] = [];
		const writtenPaths: string[] = [];

		try {
			for (const file of files) {
				const fileId = crypto.randomUUID();
				const sanitizedName = sanitizeFileName(file.name);
				const path = buildOpfsPath(cleanSessionId, fileId, sanitizedName);
				const textFile = isTextFile(file.name);

				if (textFile) {
					if (file.size > MAX_TEXT_FILE_SIZE) {
						throw new Error(
							`File too large: ${file.name} (${file.size} bytes, max ${MAX_TEXT_FILE_SIZE})`,
						);
					}
					const text = await file.text();
					await this.fs.fsWriteText(path, text);
					writtenPaths.push(path);
				}

				const entry: FilesIndexEntry = {
					id: fileId,
					name: file.name,
					size: file.size,
					mime: file.type || "application/octet-stream",
					isText: textFile,
					path,
				};

				index.entries.push(entry);
				nodes.push(buildFileNode(entry));
			}

			await this.writeIndex(cleanSessionId, index);
		} catch (err) {
			// Roll back partially uploaded text files
			for (const p of writtenPaths) {
				try {
					await this.fs.fsDelete(p);
				} catch (e) {
					console.warn("Best-effort cleanup failed:", e);
				}
			}
			throw err;
		}

		return nodes;
	}

	async readFileText(sessionId: string, fileId: string): Promise<string> {
		const cleanSessionId = sanitizeSessionId(sessionId);
		const index = await this.readIndex(cleanSessionId);
		const entry = index.entries.find((e) => e.id === fileId);
		if (!entry) {
			throw new Error(`File not found: ${fileId}`);
		}
		if (!entry.isText) {
			throw new Error(`File is not text: ${fileId}`);
		}
		const expectedPrefix = `/session-files/${cleanSessionId}/`;
		if (!entry.path.startsWith(expectedPrefix)) {
			throw new Error(`File path out of scope: ${fileId}`);
		}
		return this.fs.fsReadText(entry.path);
	}

	async deleteFile(sessionId: string, fileId: string): Promise<void> {
		return this.runSerialized(sessionId, () =>
			this.deleteFileUnlocked(sessionId, fileId),
		);
	}

	private async deleteFileUnlocked(
		sessionId: string,
		fileId: string,
	): Promise<void> {
		const cleanSessionId = sanitizeSessionId(sessionId);
		const index = await this.readIndex(cleanSessionId);
		const idx = index.entries.findIndex((e) => e.id === fileId);
		if (idx === -1) {
			throw new Error(`File not found: ${fileId}`);
		}
		const entry = index.entries[idx]!;

		const expectedPrefix = `/session-files/${cleanSessionId}/`;
		if (!entry.path.startsWith(expectedPrefix)) {
			throw new Error(`File path out of scope: ${fileId}`);
		}

		if (entry.isText) {
			try {
				await this.fs.fsDelete(entry.path);
			} catch (e) {
				console.warn("Best-effort file deletion failed:", e);
			}
		}

		index.entries.splice(idx, 1);
		await this.writeIndex(cleanSessionId, index);
	}

	async listSessionFiles(sessionId: string): Promise<FileNode[]> {
		const cleanSessionId = sanitizeSessionId(sessionId);
		const index = await this.readIndex(cleanSessionId);
		return index.entries.map(buildFileNode);
	}

	// Session load/switch replays IndexedDB filesIndex into OPFS. Upload/delete
	// persist filesIndex immediately via flushSave so snapshot stays authoritative.
	async syncIndexFromSnapshot(
		sessionId: string,
		nodes: FileNode[],
	): Promise<void> {
		const cleanSessionId = sanitizeSessionId(sessionId);
		const scopePrefix = `/session-files/${cleanSessionId}/`;
		const entries: FilesIndexEntry[] = [];
		for (const node of nodes) {
			if (!node.path.startsWith(scopePrefix)) {
				console.warn("Skipping cross-session node in snapshot:", node.id, node.path);
				continue;
			}
			entries.push({
				id: node.id,
				name: node.name,
				size: node.size ?? 0,
				mime: node.mime ?? "application/octet-stream",
				isText: isTextFile(node.name),
				path: node.path,
			});
		}
		await this.writeIndex(cleanSessionId, { version: 1, entries });
	}

	async cleanupSession(sessionId: string): Promise<void> {
		const cleanSessionId = sanitizeSessionId(sessionId);
		const dirPath = `/session-files/${cleanSessionId}`;
		try {
			const entries = await this.fs.fsList(dirPath);
			for (const entry of entries) {
				if (entry.name === "." || entry.name === "..") continue;
				const safeName = sanitizeFileName(entry.name);
				try {
					await this.fs.fsDelete(`${dirPath}/${safeName}`);
				} catch (e) {
					console.warn("Best-effort file deletion failed:", e);
				}
			}
			await this.fs.fsDelete(dirPath);
		} catch {
			// Directory might not exist
		}
	}

	private async readIndex(sessionId: string): Promise<FilesIndex> {
		const cleanSessionId = sanitizeSessionId(sessionId);
		const path = `/session-files/${cleanSessionId}/.index.json`;
		try {
			const text = await this.fs.fsReadText(path);
			const parsed = JSON.parse(text) as unknown;
			if (
				typeof parsed === "object" &&
				parsed !== null &&
				"version" in parsed &&
				(parsed as Record<string, unknown>).version === 1 &&
				"entries" in parsed &&
				Array.isArray((parsed as Record<string, unknown>).entries)
			) {
				const rawEntries = (parsed as Record<string, unknown>).entries as unknown[];
				const entries = rawEntries.filter(
					(e): e is FilesIndexEntry =>
						typeof (e as Record<string, unknown>).id === "string" &&
						typeof (e as Record<string, unknown>).name === "string" &&
						typeof (e as Record<string, unknown>).path === "string",
				);
				return { version: 1, entries };
			}
		} catch (e) {
			console.warn("Corrupt files index, resetting:", e);
		}
		return { version: 1, entries: [] };
	}

	private async writeIndex(
		sessionId: string,
		index: FilesIndex,
	): Promise<void> {
		const cleanSessionId = sanitizeSessionId(sessionId);
		const dirPath = `/session-files/${cleanSessionId}`;
		const exists = await this.fs.fsExists(dirPath);
		if (!exists) {
			await this.fs.fsMkdir(dirPath);
		}
		const path = `${dirPath}/.index.json`;
		await this.fs.fsWriteText(path, JSON.stringify(index));
	}
}
