import { escapeXmlAttr } from "../skills/validate-skill-meta";

const TAB_MENTION_RE = /@\[tab:(\d+):([^\]]+)\]/g;

export interface TabMention {
	tabId: string;
	displayName: string;
	raw: string;
}

export interface ResolvedTab {
	tabId: string;
	url: string;
	title: string;
	displayName: string;
}

export interface MissingTab {
	tabId: string;
	displayName: string;
}

export type ResolvedTabResult =
	| { ok: true; tab: ResolvedTab }
	| { ok: false; missing: MissingTab };

export function parseTabMentions(draft: string): TabMention[] {
	const mentions: TabMention[] = [];
	for (const match of draft.matchAll(TAB_MENTION_RE)) {
		const tabId = match[1] ?? "";
		const displayName = match[2] ?? "";
		const raw = match[0] ?? "";
		if (tabId && displayName) {
			mentions.push({ tabId, displayName, raw });
		}
	}
	return mentions;
}

export function stripTabMentions(draft: string): string {
	return draft.replace(TAB_MENTION_RE, "").trim();
}

export function dedupeTabMentionsById(
	mentions: TabMention[],
): TabMention[] {
	const seen = new Set<string>();
	const deduped: TabMention[] = [];
	for (const mention of mentions) {
		if (seen.has(mention.tabId)) continue;
		seen.add(mention.tabId);
		deduped.push(mention);
	}
	return deduped;
}

export async function resolveTabMentions(
	mentions: TabMention[],
): Promise<ResolvedTabResult[]> {
	const deduped = dedupeTabMentionsById(mentions);
	if (deduped.length === 0) return [];

	const tabs = await chrome.tabs.query({});
	const byId = new Map<number, chrome.tabs.Tab>();
	for (const tab of tabs) {
		if (typeof tab.id === "number") {
			byId.set(tab.id, tab);
		}
	}

	const results: ResolvedTabResult[] = [];
	for (const mention of deduped) {
		const tabIdNum = Number(mention.tabId);
		const tab = byId.get(tabIdNum);
		if (!tab) {
			results.push({
				ok: false,
				missing: { tabId: mention.tabId, displayName: mention.displayName },
			});
			continue;
		}
		const url = tab.url ?? "";
		if (!url) {
			results.push({
				ok: false,
				missing: { tabId: mention.tabId, displayName: mention.displayName },
			});
			continue;
		}
		const title = tab.title || url;
		results.push({
			ok: true,
			tab: {
				tabId: mention.tabId,
				url,
				title,
				displayName: mention.displayName,
			},
		});
	}
	return results;
}

export function buildTabContextXmlBlock(tab: ResolvedTab): string {
	return `<tab tabId="${escapeXmlAttr(tab.tabId)}" url="${escapeXmlAttr(
		tab.url,
	)}" title="${escapeXmlAttr(tab.title)}"/>`;
}
