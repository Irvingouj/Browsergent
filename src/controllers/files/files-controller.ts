import type { FsClient } from "../../skills/skill-types";
import type { FileNode } from "../../state/slices/files-slice";
import { editFile } from "./edit";
import { newPathForRename } from "./paths";
import { listAllFiles, listDirectChildren } from "./scan";
import { uploadFiles } from "./upload";

/**
 * Files controller: a serialization gate over the FS client.
 *
 * All mutations and multi-step reads run through runSerialized so that
 * concurrent operations (upload + list, edit + read) cannot interleave.
 */
export class FilesController {
	private chain: Promise<void> = Promise.resolve();

	constructor(private readonly fs: FsClient) {}

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
		return this.runSerialized(() => uploadFiles(this.fs, files));
	}

	async listAllFiles(): Promise<FileNode[]> {
		return this.runSerialized(() => listAllFiles(this.fs));
	}

	async listDirectChildren(dirPath: string): Promise<FileNode[]> {
		return this.runSerialized(() => listDirectChildren(this.fs, dirPath));
	}

	async readFileText(path: string): Promise<string> {
		const { data } = await this.fs.readText(path);
		return data;
	}

	async readFileBase64(path: string): Promise<string> {
		const { data } = await this.fs.readBase64(path);
		return data;
	}

	async writeFile(path: string, content: string): Promise<void> {
		await this.runSerialized(() => this.fs.writeText(path, content));
	}

	async deleteFile(path: string): Promise<void> {
		await this.runSerialized(() => this.fs.delete(path));
	}

	async createFolder(path: string): Promise<void> {
		await this.runSerialized(() => this.fs.mkdir(path));
	}

	async createFile(path: string, content = ""): Promise<void> {
		await this.runSerialized(() => this.fs.writeText(path, content));
	}

	async move(from: string, to: string): Promise<void> {
		await this.runSerialized(() => this.fs.move(from, to));
	}

	async rename(path: string, newName: string): Promise<string> {
		const newPath = newPathForRename(path, newName);
		await this.move(path, newPath);
		return newPath;
	}

	async copy(from: string, to: string): Promise<void> {
		await this.runSerialized(() => this.fs.copy(from, to));
	}

	async deleteFolder(path: string): Promise<void> {
		await this.runSerialized(() => this.fs.delete(path));
	}

	async editFile(
		path: string,
		oldString: string,
		newString: string,
		replaceAll: boolean,
	): Promise<{ occurrences: number; bytes: number }> {
		return this.runSerialized(() =>
			editFile(this.fs, path, oldString, newString, replaceAll),
		);
	}
}
