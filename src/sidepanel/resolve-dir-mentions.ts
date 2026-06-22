import { escapeXmlAttr } from "../skills/validate-skill-meta";

const DIR_MENTION_RE = /@\[dir:([^:\]]+):([^:\]]+)\]/g;

export interface DirMention {
	dirId: string;
	/** OPFS path of the directory, e.g. /project/src */
	path: string;
	displayName: string;
	raw: string;
}

export function parseDirMentions(draft: string): DirMention[] {
	const mentions: DirMention[] = [];
	for (const match of draft.matchAll(DIR_MENTION_RE)) {
		const path = match[1];
		const name = match[2];
		if (path === undefined || name === undefined) continue;
		mentions.push({
			dirId: path,
			path,
			displayName: name,
			raw: match[0] ?? "",
		});
	}
	return mentions;
}

export function stripDirMentions(draft: string): string {
	return draft.replace(DIR_MENTION_RE, "").trim();
}

export function dedupeDirMentionsById(
	mentions: DirMention[],
): DirMention[] {
	const seen = new Set<string>();
	const deduped: DirMention[] = [];
	for (const mention of mentions) {
		if (seen.has(mention.dirId)) continue;
		seen.add(mention.dirId);
		deduped.push(mention);
	}
	return deduped;
}

export interface DirContextChild {
	name: string;
	path: string;
	kind: "file" | "directory";
	size: number;
	isText: boolean;
}

/**
 * Build an XML block listing a directory's immediate children so the agent
 * knows what files are available without wasting turns on file_list.
 */
const DIR_CHILDREN_CAP = 50;

/**
 * Build an XML block listing a directory's immediate children so the agent
 * knows what files are available without wasting turns on file_list. Caps at
 * DIR_CHILDREN_CAP entries to bound prompt size; the rest are summarized in a
 * <note> directing the agent to file_list.
 */
export function buildDirContextXmlBlock(
	mention: DirMention,
	children: DirContextChild[],
): string {
	const path = escapeXmlAttr(mention.path);
	const name = escapeXmlAttr(mention.displayName);

	if (children.length === 0) {
		return (
			`<directory_reference path="${path}" name="${name}">\n` +
			`  <note>directory empty or not found</note>\n` +
			`</directory_reference>`
		);
	}

	const capped = children.slice(0, DIR_CHILDREN_CAP);
	const omitted = children.length - capped.length;

	const entries = capped
		.map((c) => {
			const ep = escapeXmlAttr(c.path);
			const en = escapeXmlAttr(c.name);
			const es = String(c.size);
			const ek = escapeXmlAttr(c.kind);
			const et = c.isText ? "yes" : "no";
			return `  <entry path="${ep}" name="${en}" size="${es}" kind="${ek}" isText="${et}" />`;
		})
		.join("\n");

	const note =
		omitted > 0
			? `\n  <note>${omitted} more entries omitted; use file_list to enumerate</note>`
			: "";

	return (
		`<directory_reference path="${path}" name="${name}">\n` +
		`${entries}${note}\n` +
		`</directory_reference>`
	);
}
