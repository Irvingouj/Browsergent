import { isTextFile } from "../controllers/files-utils";
import type { CommandPickerItem } from "./components/CommandPicker";
import type { FileNode } from "../state/slices/files-slice";

export interface SlashState {
	startIndex: number;
	query: string;
}

export function detectSlashState(value: string, cursor: number): SlashState | null {
	const before = value.slice(0, cursor);
	const slashIndex = before.lastIndexOf("/");
	if (slashIndex === -1) return null;
	if (slashIndex > 0 && !/\s/.test(before[slashIndex - 1] ?? "")) {
		return null;
	}
	const token = before.slice(slashIndex);
	if (/\s/.test(token.slice(1))) return null;
	return { startIndex: slashIndex, query: token.slice(1) };
}

export interface AtState {
	query: string;
	startIndex: number;
	endIndex: number;
}

export function detectAtState(value: string, cursor: number): AtState | null {
	const before = value.slice(0, cursor);
	const atIndex = before.lastIndexOf("@");
	if (atIndex === -1) return null;
	if (atIndex > 0 && !/\s/.test(before[atIndex - 1] ?? "")) {
		return null;
	}
	const token = before.slice(atIndex);
	if (/\s/.test(token.slice(1))) return null;
	const query = token.slice(1);
	return {
		query,
		startIndex: atIndex,
		endIndex: atIndex + 1 + query.length,
	};
}

export function resolvePickerState(
	value: string,
	cursor: number,
): { atState: AtState | null; slashState: SlashState | null } {
	const at = detectAtState(value, cursor);
	if (at) {
		return { atState: at, slashState: null };
	}
	return { atState: null, slashState: detectSlashState(value, cursor) };
}

export function buildPickerInsert(
	text: string,
	cursor: number,
	startIndex: number,
	insertText: string,
	endIndex?: number,
): { nextText: string; cursorPos: number } {
	const before = text.slice(0, startIndex);
	const after = text.slice(endIndex ?? cursor);
	const nextText = `${before}${insertText}${after}`;
	const cursorPos = before.length + insertText.length;
	return { nextText, cursorPos };
}

export function sanitizeTokenName(name: string): string {
	return name.replace(/[\[\]:]/g, "_");
}

export function buildFileMentionToken(id: string, name: string): string {
	return `@[file:${id}:${sanitizeTokenName(name)}]`;
}

export function filesToPickerItems(files: ReadonlyArray<FileNode>): CommandPickerItem[] {
	return files
		.filter((file) => file.kind === "file" && isTextFile(file.name))
		.map((file) => ({
			id: file.id,
			label: file.name,
			description: file.path,
			insertText: buildFileMentionToken(file.id, file.name),
		}));
}
