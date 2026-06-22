import type { SkillFsClient } from "../skills/skill-types";
import type { FileNode } from "../state/slices/files-slice";
import {
	buildDirectoryNode,
	buildFileNode,
	fileToBase64,
	isTextFile,
	sanitizeFileName,
} from "./files-utils";

export {
	buildDirectoryNode,
	buildFileNode,
	isTextFile,
	sanitizeFileName,
} from "./files-utils";

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
			const name = segments.at(-1);
			if (name === undefined) {
				throw new Error(`Invalid file name: ${file.name}`);
			}
			const isText = isTextFile(name);
			const dirSegments = segments.slice(0, -1);
			let dirPath = "";
			for (const seg of dirSegments) {
				dirPath = dirPath === "" ? `/${seg}` : `${dirPath}/${seg}`;
				if (!(await this.fs.fsExists(dirPath))) {
					await this.fs.fsMkdir(dirPath);
				}
			}
			const path = `/${segments.join("/")}`;
			// fs is type-agnostic: text decodes to UTF-8, everything else is stored as base64 bytes.
			let bytes: number;
			if (isText) {
				const text = await file.text();
				await this.fs.fsWriteText(path, text);
				bytes = text.length;
			} else {
				const base64 = await fileToBase64(file);
				await this.fs.fsWriteBase64(path, base64);
				bytes = file.size;
			}
			const parentId =
				dirSegments.length > 0 ? `/${dirSegments.join("/")}` : undefined;
			nodes.push(
				buildFileNode({
					name,
					path,
					...(parentId !== undefined ? { parentId } : {}),
					size: bytes,
				}),
			);
		}
		return nodes;
	}

	async listAllFiles(): Promise<FileNode[]> {
		return this.scanRecursive("/", undefined);
	}

	async listDirectChildren(dirPath: string): Promise<FileNode[]> {
		let entries: ReadonlyArray<{ name: string; kind: string }>;
		try {
			entries = await this.fs.fsList(dirPath);
		} catch {
			return [];
		}
		const out: FileNode[] = [];
		for (const entry of entries) {
			const childPath =
				dirPath === "/" ? `/${entry.name}` : `${dirPath}/${entry.name}`;
			if (entry.kind === "directory") {
				out.push(
					buildDirectoryNode({ name: entry.name, path: childPath }),
				);
			} else {
				out.push(
					buildFileNode({ name: entry.name, path: childPath }),
				);
			}
		}
		return out;
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
		return this.runSerialized(() => this.fs.fsWriteText(path, content));
	}

	async deleteFile(path: string): Promise<void> {
		return this.runSerialized(() => this.fs.fsDelete(path));
	}

	async createFolder(path: string): Promise<void> {
		return this.runSerialized(() => this.fs.fsMkdir(path));
	}

	async createFile(path: string, content = ""): Promise<void> {
		return this.runSerialized(() => this.fs.fsWriteText(path, content));
	}

	async move(from: string, to: string): Promise<void> {
		return this.runSerialized(() => this.fs.fsMove(from, to));
	}

	async rename(path: string, newName: string): Promise<string> {
		const lastSlash = path.lastIndexOf("/");
		const dir = lastSlash <= 0 ? "" : path.slice(0, lastSlash);
		const newPath = dir === "" ? `/${newName}` : `${dir}/${newName}`;
		await this.move(path, newPath);
		return newPath;
	}

	async copy(from: string, to: string): Promise<void> {
		return this.runSerialized(() => this.fs.fsCopy(from, to));
	}

	async deleteFolder(path: string): Promise<void> {
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

		await this.fs.fsWriteText(path, updated);
		return { occurrences: replaceAll ? occurrences : 1, bytes: updated.length };
	}
}

function countOccurrences(haystack: string, needle: string): number {
	if (needle.length === 0) return 0;
	let count = 0;
	let i = haystack.indexOf(needle);
	while (i !== -1) {
		count++;
		i = haystack.indexOf(needle, i + needle.length);
	}
	return count;
}
