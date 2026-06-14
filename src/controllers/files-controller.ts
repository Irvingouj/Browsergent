import type { FileNode } from "../state/slices/files-slice";
import type { SkillFsClient } from "../skills/skill-types";
import {
	buildDirectoryNode,
	buildFileNode,
	isTextFile,
	sanitizeFileName,
} from "./files-utils";

export {
	isTextFile,
	sanitizeFileName,
	buildFileNode,
	buildDirectoryNode,
} from "./files-utils";

const MAX_TEXT_FILE_SIZE = 1_000_000; // 1 MB

export class FilesController {
	private chain: Promise<void> = Promise.resolve();

	constructor(private readonly fs: SkillFsClient) {}

	private runSerialized<T>(operation: () => Promise<T>): Promise<T> {
		const previous = this.chain;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		this.chain = previous.then(() => gate);
		return previous
			.then(() => operation())
			.finally(() => {
				release();
			});
	}

	async uploadFiles(files: File[]): Promise<FileNode[]> {
		return this.runSerialized(() => this.uploadFilesUnlocked(files));
	}

	private async uploadFilesUnlocked(files: File[]): Promise<FileNode[]> {
		const nodes: FileNode[] = [];
		for (const file of files) {
			const rawSegments = file.name.split("/");
			const segments: string[] = [];
			for (const raw of rawSegments) {
				const seg = sanitizeFileName(raw);
				if (seg.length === 0) continue;
				if (seg === "." || seg === "..") {
					throw new Error(`Invalid file name: ${file.name}`);
				}
				segments.push(seg);
			}
			if (segments.length === 0) {
				throw new Error(`Invalid file name: ${file.name}`);
			}
			const name = segments[segments.length - 1]!;
			if (!isTextFile(name)) {
				throw new Error(`Binary uploads unsupported: ${file.name}`);
			}
			if (file.size > MAX_TEXT_FILE_SIZE) {
				throw new Error(
					`File too large: ${file.name} (${file.size} bytes, max ${MAX_TEXT_FILE_SIZE})`,
				);
			}
			const text = await file.text();
			const dirSegments = segments.slice(0, -1);
			let dirPath = "";
			for (const seg of dirSegments) {
				dirPath = dirPath === "" ? `/${seg}` : `${dirPath}/${seg}`;
				if (!(await this.fs.fsExists(dirPath))) {
					await this.fs.fsMkdir(dirPath);
				}
			}
			const path = "/" + segments.join("/");
			await this.fs.fsWriteText(path, text);
			const parentId = dirSegments.length > 0 ? "/" + dirSegments.join("/") : undefined;
			nodes.push(
				buildFileNode({ name, path, ...(parentId !== undefined ? { parentId } : {}), size: text.length }),
			);
		}
		return nodes;
	}

	async listAllFiles(): Promise<FileNode[]> {
		return this.scanRecursive("/", undefined);
	}

	private async scanRecursive(
		root: string,
		parentId: string | undefined,
	): Promise<FileNode[]> {
		let entries: ReadonlyArray<{ name: string; kind: string }>;
		try {
			entries = await this.fs.fsList(root);
		} catch {
			return [];
		}
		const out: FileNode[] = [];
		for (const entry of entries) {
			const childPath =
				root === "/" ? `/${entry.name}` : `${root}/${entry.name}`;
			if (entry.kind === "directory") {
				out.push(
					buildDirectoryNode({
						name: entry.name,
						path: childPath,
						parentId,
					}),
				);
				out.push(...(await this.scanRecursive(childPath, childPath)));
			} else {
				out.push(
					buildFileNode({ name: entry.name, path: childPath, parentId }),
				);
			}
		}
		return out;
	}

	async readFileText(path: string): Promise<string> {
		return this.fs.fsReadText(path);
	}

	async writeFile(path: string, content: string): Promise<void> {
		if (content.length > MAX_TEXT_FILE_SIZE) {
			throw new Error(
				`Content too large (${content.length} bytes, max ${MAX_TEXT_FILE_SIZE})`,
			);
		}
		return this.runSerialized(() => this.fs.fsWriteText(path, content));
	}

	async deleteFile(path: string): Promise<void> {
		return this.runSerialized(() => this.fs.fsDelete(path));
	}

	async editFile(
		path: string,
		oldString: string,
		newString: string,
		replaceAll: boolean,
	): Promise<{ occurrences: number; bytes: number }> {
		return this.runSerialized(() =>
			this.editFileUnlocked(path, oldString, newString, replaceAll),
		);
	}

	private async editFileUnlocked(
		path: string,
		oldString: string,
		newString: string,
		replaceAll: boolean,
	): Promise<{ occurrences: number; bytes: number }> {
		if (oldString === newString) {
			throw new Error("old_string and new_string must differ");
		}
		if (oldString.length === 0) {
			throw new Error("old_string must not be empty");
		}

		const original = await this.fs.fsReadText(path);
		const occurrences = countOccurrences(original, oldString);
		if (occurrences === 0) {
			throw new Error("old_string not found in file");
		}
		if (occurrences > 1 && !replaceAll) {
			throw new Error(
				`old_string matches ${occurrences} times; provide more context or set replace_all=true`,
			);
		}

		const updated = replaceAll
			? original.split(oldString).join(newString)
			: original.replace(oldString, newString);
		if (updated.length > MAX_TEXT_FILE_SIZE) {
			throw new Error(
				`Edit would exceed max file size (${MAX_TEXT_FILE_SIZE} bytes)`,
			);
		}

		await this.fs.fsWriteText(path, updated);
		return { occurrences: replaceAll ? occurrences : 1, bytes: updated.length };
	}
}

function countOccurrences(haystack: string, needle: string): number {
	if (needle.length === 0) return 0;
	let count = 0;
	let i = 0;
	while ((i = haystack.indexOf(needle, i)) !== -1) {
		count++;
		i += needle.length;
	}
	return count;
}
