import type { FsListEntry } from "@pi-oxide/extension-js";
import type {
	BufferEncoding,
	CpOptions,
	FileContent,
	FsStat,
	IFileSystem,
	MkdirOptions,
	RmOptions,
} from "just-bash";
import type { FsClient } from "../skills/skill-types";
import { BashTimeoutError } from "./types";

const FILE_MODE = 0o100644;
const DIR_MODE = 0o040755;

interface ErrnoError extends Error {
	code: string;
}

function errno(code: string, message: string): ErrnoError {
	const error = new Error(message) as ErrnoError;
	error.code = code;
	return error;
}

/** Resolve `.` and `..` and force a single leading slash. `..` above `/` stays `/`. */
export function normalizeVirtualPath(path: string): string {
	if (path.includes("\0")) {
		throw errno("EINVAL", "path contains a null byte");
	}
	const absolute = path.startsWith("/") ? path : `/${path}`;
	const parts: string[] = [];
	for (const part of absolute.split("/")) {
		if (part === "" || part === ".") continue;
		if (part === "..") {
			parts.pop();
			continue;
		}
		parts.push(part);
	}
	return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

function dirname(path: string): string {
	const normalized = normalizeVirtualPath(path);
	if (normalized === "/") return "/";
	const slash = normalized.lastIndexOf("/");
	return slash <= 0 ? "/" : normalized.slice(0, slash);
}

function joinPath(parent: string, name: string): string {
	const base = normalizeVirtualPath(parent);
	return normalizeVirtualPath(base === "/" ? `/${name}` : `${base}/${name}`);
}

function encodingOf(
	options: { encoding?: BufferEncoding | null } | BufferEncoding | undefined,
): BufferEncoding | null {
	if (options == null) return "utf8";
	if (typeof options === "string") return options;
	if (options.encoding === undefined) return "utf8";
	return options.encoding;
}

function binaryString(bytes: Uint8Array): string {
	let binary = "";
	for (let index = 0; index < bytes.length; index += 1) {
		binary += String.fromCharCode(bytes[index] ?? 0);
	}
	return binary;
}

function encodeBase64(bytes: Uint8Array): string {
	return btoa(binaryString(bytes));
}

function decodeBase64(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

function decodeHex(value: string): Uint8Array {
	const cleaned = value.length % 2 === 0 ? value : `0${value}`;
	const bytes = new Uint8Array(cleaned.length / 2);
	for (let index = 0; index < bytes.length; index += 1) {
		const pair = cleaned.slice(index * 2, index * 2 + 2);
		const byte = Number.parseInt(pair, 16);
		if (Number.isNaN(byte)) {
			throw errno("EINVAL", `bad hex byte: ${pair}`);
		}
		bytes[index] = byte;
	}
	return bytes;
}

function latin1Bytes(value: string): Uint8Array {
	const bytes = new Uint8Array(value.length);
	for (let index = 0; index < value.length; index += 1) {
		bytes[index] = value.charCodeAt(index) & 0xff;
	}
	return bytes;
}

function latin1String(bytes: Uint8Array): string {
	return binaryString(bytes);
}

function toBytes(
	content: FileContent,
	encoding: BufferEncoding | null,
): Uint8Array | string {
	if (content instanceof Uint8Array) return content;
	if (encoding === "base64") return decodeBase64(content);
	if (encoding === "hex") return decodeHex(content);
	if (
		encoding === "binary" ||
		encoding === "latin1" ||
		encoding === "ascii" ||
		encoding === null
	) {
		return latin1Bytes(content);
	}
	return content;
}

/**
 * just-bash filesystem backed by Browsergent's OPFS client.
 *
 * Globs call synchronous `getAllPaths()`. OPFS listing is async, so the path
 * cache is rebuilt before each command and updated when that command writes.
 */
export class OpfsFileSystem implements IFileSystem {
	private paths = new Set<string>(["/"]);

	constructor(private readonly fs: FsClient) {}

	async warm(signal?: AbortSignal): Promise<void> {
		throwIfAborted(signal);
		const next = new Set<string>(["/"]);
		await this.walk("/", next, signal);
		throwIfAborted(signal);
		this.paths = next;
	}

	resolvePath(base: string, path: string): string {
		if (path.startsWith("/")) return normalizeVirtualPath(path);
		const root = normalizeVirtualPath(base);
		return normalizeVirtualPath(root === "/" ? `/${path}` : `${root}/${path}`);
	}

	getAllPaths(): string[] {
		return [...this.paths];
	}

	async exists(path: string): Promise<boolean> {
		return this.pathExists(path);
	}

	async stat(path: string): Promise<FsStat> {
		return this.statNormalized(normalizeVirtualPath(path));
	}

	async lstat(path: string): Promise<FsStat> {
		return this.stat(path);
	}

	async realpath(path: string): Promise<string> {
		const target = normalizeVirtualPath(path);
		if (!(await this.pathExists(target))) {
			throw errno("ENOENT", `ENOENT: ${target}`);
		}
		return target;
	}

	async readdir(path: string): Promise<string[]> {
		const entries = await this.listDir(path);
		return entries.map((entry) => entry.name);
	}

	async readdirWithFileTypes(path: string): Promise<
		Array<{
			name: string;
			isFile: boolean;
			isDirectory: boolean;
			isSymbolicLink: boolean;
		}>
	> {
		const entries = await this.listDir(path);
		return entries.map((entry) => ({
			name: entry.name,
			isFile: entry.kind !== "directory",
			isDirectory: entry.kind === "directory",
			isSymbolicLink: false,
		}));
	}

	async readFile(
		path: string,
		options?: { encoding?: BufferEncoding | null } | BufferEncoding,
	): Promise<string> {
		const bytes = await this.readFileBuffer(path);
		const encoding = encodingOf(options);
		if (encoding === "base64") return encodeBase64(bytes);
		if (encoding === "hex") {
			let hex = "";
			for (let index = 0; index < bytes.length; index += 1) {
				hex += (bytes[index] ?? 0).toString(16).padStart(2, "0");
			}
			return hex;
		}
		if (
			encoding === "binary" ||
			encoding === "latin1" ||
			encoding === "ascii" ||
			encoding === null
		) {
			return latin1String(bytes);
		}
		return new TextDecoder().decode(bytes);
	}

	async readFileBuffer(path: string): Promise<Uint8Array> {
		const target = normalizeVirtualPath(path);
		await this.assertFile(target);
		const { data } = await this.fs.readBase64(target);
		return decodeBase64(data);
	}

	async writeFile(
		path: string,
		content: FileContent,
		options?: { encoding?: BufferEncoding } | BufferEncoding,
	): Promise<void> {
		const target = normalizeVirtualPath(path);
		await this.assertNotDirectory(target);
		await this.ensureParent(target);
		const body = toBytes(content, encodingOf(options));
		if (typeof body === "string") {
			await this.fs.writeText(target, body);
		} else {
			await this.fs.writeBase64(target, encodeBase64(body));
		}
		this.remember(target);
	}

	async appendFile(
		path: string,
		content: FileContent,
		options?: { encoding?: BufferEncoding } | BufferEncoding,
	): Promise<void> {
		const target = normalizeVirtualPath(path);
		const chunk = toBytes(content, encodingOf(options));
		if (!(await this.pathExists(target))) {
			await this.writeFile(target, chunk);
			return;
		}
		await this.assertFile(target);
		if (typeof chunk === "string") {
			try {
				const { data } = await this.fs.readText(target);
				await this.writeFile(target, data + chunk);
				return;
			} catch (err: unknown) {
				// readText rejects binary OPFS files. Any other failure still throws.
				if (!isBinaryReadError(err)) throw err;
			}
		}
		const existing = await this.readFileBuffer(target);
		const extra =
			typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
		const merged = new Uint8Array(existing.length + extra.length);
		merged.set(existing);
		merged.set(extra, existing.length);
		await this.writeFile(target, merged);
	}

	async mkdir(path: string, options?: MkdirOptions): Promise<void> {
		const target = normalizeVirtualPath(path);
		if (target === "/") return;
		if (options?.recursive) {
			const segments = target
				.split("/")
				.filter((segment) => segment.length > 0);
			let current = "";
			for (const segment of segments) {
				current = `${current}/${segment}`;
				if (await this.pathExists(current)) {
					const stat = await this.statNormalized(current);
					if (!stat.isDirectory) {
						throw errno("EEXIST", `EEXIST: ${current}`);
					}
					continue;
				}
				const created = await this.fs.mkdir(current);
				if (!created.ok) throw errno("EIO", `mkdir failed: ${current}`);
				this.remember(current);
			}
			return;
		}
		const parent = dirname(target);
		if (!(await this.pathExists(parent))) {
			throw errno("ENOENT", `ENOENT: ${parent}`);
		}
		const parentStat = await this.statNormalized(parent);
		if (!parentStat.isDirectory) {
			throw errno("ENOTDIR", `ENOTDIR: ${parent}`);
		}
		if (await this.pathExists(target)) {
			throw errno("EEXIST", `EEXIST: ${target}`);
		}
		const created = await this.fs.mkdir(target);
		if (!created.ok) throw errno("EIO", `mkdir failed: ${target}`);
		this.remember(target);
	}

	async rm(path: string, options?: RmOptions): Promise<void> {
		const target = normalizeVirtualPath(path);
		if (target === "/") throw errno("EPERM", "cannot remove /");
		if (!(await this.pathExists(target))) {
			if (options?.force) return;
			throw errno("ENOENT", `ENOENT: ${target}`);
		}
		const stat = await this.statNormalized(target);
		if (stat.isDirectory) {
			const names = await this.readdir(target);
			if (names.length > 0 && !options?.recursive) {
				throw errno("ENOTEMPTY", `ENOTEMPTY: ${target}`);
			}
			for (const name of names) {
				await this.rm(joinPath(target, name), { recursive: true, force: true });
			}
		}
		const removed = await this.fs.delete(target);
		if (!removed.ok) throw errno("EIO", `delete failed: ${target}`);
		this.forget(target);
	}

	async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
		// just-bash already appends the source name when dest is a directory.
		const from = normalizeVirtualPath(src);
		const to = normalizeVirtualPath(dest);
		const source = await this.statNormalized(from);
		if (source.isDirectory) {
			if (!options?.recursive) {
				throw errno("EISDIR", `EISDIR: ${from}`);
			}
			await this.mkdir(to, { recursive: true });
			for (const name of await this.readdir(from)) {
				await this.cp(joinPath(from, name), joinPath(to, name), {
					recursive: true,
				});
			}
			return;
		}
		if (await this.pathExists(to)) {
			await this.assertFile(to);
			await this.rm(to, { force: true });
		}
		await this.ensureParent(to);
		const copied = await this.fs.copy(from, to);
		if (!copied.ok) throw errno("EIO", `copy failed: ${from} -> ${to}`);
		this.remember(to);
	}

	async mv(src: string, dest: string): Promise<void> {
		// just-bash already appends the source name when dest is a directory.
		const from = normalizeVirtualPath(src);
		const to = normalizeVirtualPath(dest);
		if (!(await this.pathExists(from))) {
			throw errno("ENOENT", `ENOENT: ${from}`);
		}
		if (await this.pathExists(to)) {
			await this.assertFile(to);
			await this.rm(to, { force: true });
		}
		await this.ensureParent(to);
		const moved = await this.fs.move(from, to);
		if (!moved.ok) throw errno("EIO", `move failed: ${from} -> ${to}`);
		this.relocate(from, to);
	}

	async chmod(path: string, _mode: number): Promise<void> {
		await this.stat(path);
	}

	async utimes(path: string, _atime: Date, _mtime: Date): Promise<void> {
		await this.stat(path);
	}

	async symlink(_target: string, _linkPath: string): Promise<void> {
		throw errno("EPERM", "symlinks are not available on this filesystem");
	}

	async link(_existingPath: string, _newPath: string): Promise<void> {
		throw errno("EPERM", "hard links are not available on this filesystem");
	}

	async readlink(_path: string): Promise<string> {
		throw errno("EPERM", "symlinks are not available on this filesystem");
	}

	private async pathExists(path: string): Promise<boolean> {
		const target = normalizeVirtualPath(path);
		if (target === "/") return true;
		const result = await this.fs.exists(target);
		return result.exists;
	}

	private async statNormalized(path: string): Promise<FsStat> {
		if (path === "/") {
			return {
				isFile: false,
				isDirectory: true,
				isSymbolicLink: false,
				mode: DIR_MODE,
				size: 0,
				mtime: new Date(0),
				identity: "/",
			};
		}
		if (!(await this.pathExists(path))) {
			throw errno("ENOENT", `ENOENT: ${path}`);
		}
		const info = await this.fs.stat(path);
		const isDirectory = info.kind === "directory";
		return {
			isFile: !isDirectory,
			isDirectory,
			isSymbolicLink: false,
			mode: isDirectory ? DIR_MODE : FILE_MODE,
			size: info.size,
			mtime: new Date(info.modified_at ?? 0),
			// One path is one file. just-bash refuses mv/cp without this.
			identity: path,
		};
	}

	private async listDir(path: string): Promise<FsListEntry[]> {
		const target = normalizeVirtualPath(path);
		const stat = await this.statNormalized(target);
		if (!stat.isDirectory) throw errno("ENOTDIR", `ENOTDIR: ${target}`);
		const listed = await this.fs.list(target);
		return listed.entries;
	}

	private async assertFile(path: string): Promise<void> {
		const stat = await this.statNormalized(path);
		if (stat.isDirectory) throw errno("EISDIR", `EISDIR: ${path}`);
	}

	private async assertNotDirectory(path: string): Promise<void> {
		if (!(await this.pathExists(path))) return;
		const stat = await this.statNormalized(path);
		if (stat.isDirectory) throw errno("EISDIR", `EISDIR: ${path}`);
	}

	private async ensureParent(path: string): Promise<void> {
		const parent = dirname(path);
		if (parent === "/") return;
		if (await this.pathExists(parent)) {
			const stat = await this.statNormalized(parent);
			if (!stat.isDirectory) throw errno("ENOTDIR", `ENOTDIR: ${parent}`);
			return;
		}
		await this.ensureParent(parent);
		const created = await this.fs.mkdir(parent);
		if (!created.ok) throw errno("EIO", `mkdir failed: ${parent}`);
		this.remember(parent);
	}

	private async walk(
		dir: string,
		into: Set<string>,
		signal?: AbortSignal,
	): Promise<void> {
		throwIfAborted(signal);
		const listed = await raceAbort(this.fs.list(dir), signal);
		for (const entry of listed.entries) {
			throwIfAborted(signal);
			if (!entry.name || entry.name.includes("/")) continue;
			const path = dir === "/" ? `/${entry.name}` : `${dir}/${entry.name}`;
			into.add(path);
			if (entry.kind === "directory") await this.walk(path, into, signal);
		}
	}

	private remember(path: string): void {
		let current = normalizeVirtualPath(path);
		this.paths.add(current);
		while (current !== "/") {
			current = dirname(current);
			this.paths.add(current);
		}
	}

	private forget(path: string): void {
		const target = normalizeVirtualPath(path);
		const prefix = `${target}/`;
		for (const candidate of this.paths) {
			if (candidate === target || candidate.startsWith(prefix)) {
				this.paths.delete(candidate);
			}
		}
	}

	private relocate(from: string, to: string): void {
		const source = normalizeVirtualPath(from);
		const dest = normalizeVirtualPath(to);
		const prefix = `${source}/`;
		const next = new Set<string>();
		for (const path of this.paths) {
			if (path === source) next.add(dest);
			else if (path.startsWith(prefix))
				next.add(dest + path.slice(source.length));
			else next.add(path);
		}
		this.paths = next;
	}
}

function isBinaryReadError(
	// readText failure. Only a binary-file rejection should fall through.
	err: unknown,
): boolean {
	if (!(err instanceof Error)) return false;
	return err.message.includes("not text") || err.message.includes("binary");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw new BashTimeoutError();
}

function raceAbort<T>(
	work: Promise<T>,
	signal: AbortSignal | undefined,
): Promise<T> {
	if (!signal) return work;
	if (signal.aborted) return Promise.reject(new BashTimeoutError());
	return new Promise<T>((resolve, reject) => {
		const onAbort = (): void => {
			reject(new BashTimeoutError());
		};
		signal.addEventListener("abort", onAbort, { once: true });
		work.then(
			(value) => {
				signal.removeEventListener("abort", onAbort);
				resolve(value);
			},
			(err: unknown) => {
				// The filesystem list failed; the caller decides whether that is fatal.
				signal.removeEventListener("abort", onAbort);
				reject(err);
			},
		);
	});
}
