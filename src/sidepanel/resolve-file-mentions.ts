import type { FilesController } from "../controllers/files-controller";
import { stripTabMentions } from "./resolve-tab-mentions";
import { escapeXmlAttr, escapeXmlText } from "../skills/validate-skill-meta";
import { truncateWithMarker } from "../utils/truncate";

const FILE_MENTION_RE = /@\[file:([^:\]]+):([^:\]]+)\]/g;

export interface FileMention {
	fileId: string;
	displayName: string;
	raw: string;
}

export interface ResolvedAttachment {
	fileId: string;
	displayName: string;
	content: string;
}

export const MAX_FILE_ATTACHMENT_CHARS = 32_000;

export function parseFileMentions(draft: string): FileMention[] {
	const mentions: FileMention[] = [];
	for (const match of draft.matchAll(FILE_MENTION_RE)) {
		const fileId = match[1] ?? "";
		const displayName = match[2] ?? "";
		const raw = match[0] ?? "";
		if (fileId && displayName) {
			mentions.push({ fileId, displayName, raw });
		}
	}
	return mentions;
}

export function stripFileMentions(draft: string): string {
	return draft.replace(FILE_MENTION_RE, "").trim();
}

export function truncateFileContent(content: string): string {
	return truncateWithMarker(
		content,
		MAX_FILE_ATTACHMENT_CHARS,
		"\n\n[truncated]\n\n",
	);
}

export function buildAttachmentXmlBlock(
	displayName: string,
	fileId: string,
	content: string,
): string {
	return [
		`<attachment name="${escapeXmlAttr(displayName)}" id="${escapeXmlAttr(fileId)}">`,
		escapeXmlText(content),
		"</attachment>",
	].join("\n");
}

export function dedupeFileMentionsById(mentions: FileMention[]): FileMention[] {
	const seen = new Set<string>();
	const deduped: FileMention[] = [];
	for (const mention of mentions) {
		if (seen.has(mention.fileId)) continue;
		seen.add(mention.fileId);
		deduped.push(mention);
	}
	return deduped;
}

export async function resolveFileMentions(
	mentions: FileMention[],
	filesController: FilesController,
): Promise<ResolvedAttachment[]> {
	const resolved: ResolvedAttachment[] = [];
	for (const mention of dedupeFileMentionsById(mentions)) {
		const content = await filesController.readFileText(mention.fileId);
		const truncated = truncateFileContent(content);
		resolved.push({
			fileId: mention.fileId,
			displayName: mention.displayName,
			content: truncated,
		});
	}
	return resolved;
}

export function buildTaskWithAttachments(
	userText: string,
	attachments: ResolvedAttachment[],
): string {
	const remainder = stripTabMentions(stripFileMentions(userText));
	const blocks = attachments.map((a) =>
		buildAttachmentXmlBlock(a.displayName, a.fileId, a.content),
	);

	if (blocks.length > 0 && remainder) {
		return `${blocks.join("\n\n")}\n\nUser task: ${remainder}`;
	}
	if (blocks.length > 0) {
		return blocks.join("\n\n");
	}
	return remainder;
}
