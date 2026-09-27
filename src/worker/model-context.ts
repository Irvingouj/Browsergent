import type { AgentContentBlock, AgentMessage } from "@pi-oxide/pi-host-web";

/**
 * Send-time tiers for tool results already stored in the transcript.
 * Recent results stay as stored. Older ones shrink, then clear, and a
 * result never grows back during the run.
 */

export const RECENT_FULL_RESULTS = 3;
export const STUB_HEAD_CHARS = 1_000;
export const STUB_TAIL_CHARS = 500;
export const OLDER_ARGS_CHARS = 500;

const RANK = { full: 0, stub: 1, cleared: 2 } as const;
type Tier = keyof typeof RANK;

export interface OutboundTierOptions {
	maxContextTokens: number;
	recentFull?: number;
	fraction?: number;
}

export function outboundBudgetTokens(options: OutboundTierOptions): number {
	const fraction = options.fraction ?? 0.7;
	return Math.floor(options.maxContextTokens * fraction);
}

export function estimateOutboundTokens(
	messages: readonly AgentMessage[],
): number {
	let tokens = 0;
	for (const message of messages) {
		const text = textOf(message);
		if (message.role === "tool_result") {
			tokens += Math.ceil(text.length / 3);
		} else {
			tokens += Math.ceil(text.length / 4);
			tokens += Math.ceil(toolArgsText(message).length / 3);
		}
		tokens += imageCount(message) * 1_200;
	}
	return tokens;
}

export class OutboundTiering {
	private readonly rank = new Map<string, Tier>();

	prepare(
		messages: readonly AgentMessage[],
		options: OutboundTierOptions,
	): AgentMessage[] {
		const recentFull = options.recentFull ?? RECENT_FULL_RESULTS;
		const budget = outboundBudgetTokens(options);
		const ids = toolResultIds(messages);
		const recent = new Set(recentFull > 0 ? ids.slice(-recentFull) : []);
		for (const id of ids) {
			if (recent.has(id)) continue;
			this.demote(id, "stub");
		}
		let next = this.apply(messages);
		let guard = ids.length * 2 + 1;
		while (estimateOutboundTokens(next) > budget && guard > 0) {
			const target = ids.find(
				(id) => (this.rank.get(id) ?? "full") !== "cleared",
			);
			if (!target) break;
			const current = this.rank.get(target) ?? "full";
			this.demote(target, current === "full" ? "stub" : "cleared");
			next = this.apply(messages);
			guard -= 1;
		}
		return next;
	}

	private demote(id: string, to: Tier): void {
		const current = this.rank.get(id) ?? "full";
		if (RANK[to] > RANK[current]) this.rank.set(id, to);
	}

	private apply(messages: readonly AgentMessage[]): AgentMessage[] {
		const cleared = new Set(
			[...this.rank.entries()]
				.filter(([, tier]) => tier === "cleared")
				.map(([id]) => id),
		);
		const stubbed = new Set(
			[...this.rank.entries()]
				.filter(([, tier]) => tier === "stub")
				.map(([id]) => id),
		);
		return messages.map((message) => {
			if (message.role === "tool_result") {
				const id = message.tool_call_id ?? "";
				const text = textOf(message);
				if (cleared.has(id)) return replaceText(message, clearedText(text));
				if (stubbed.has(id)) return replaceText(message, stubText(text));
				return message;
			}
			if (message.role !== "assistant") return message;
			return {
				...message,
				content: message.content.map((block) => {
					if (block.type !== "tool_call") return block;
					if (cleared.has(block.id)) {
						return { ...block, arguments: { _elided: true } };
					}
					if (!stubbed.has(block.id)) return block;
					const encoded = JSON.stringify(block.arguments ?? {});
					if (encoded.length <= OLDER_ARGS_CHARS) return block;
					return {
						...block,
						arguments: { _preview: encoded.slice(0, OLDER_ARGS_CHARS) },
					};
				}),
			};
		});
	}
}

function toolResultIds(messages: readonly AgentMessage[]): string[] {
	const ids: string[] = [];
	for (const message of messages) {
		if (message.role === "tool_result" && message.tool_call_id) {
			ids.push(message.tool_call_id);
		}
	}
	return ids;
}

function textOf(message: AgentMessage): string {
	return message.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

function toolArgsText(message: AgentMessage): string {
	return message.content
		.filter((block) => block.type === "tool_call")
		.map((block) => JSON.stringify(block.arguments ?? {}))
		.join("");
}

function imageCount(message: AgentMessage): number {
	return message.content.filter((block) => block.type === "image").length;
}

function artifactPath(text: string): string | undefined {
	return text.match(/Full output saved to (\/artifacts\/\S+)/)?.[1];
}

function stubText(text: string): string {
	if (text.length <= STUB_HEAD_CHARS + STUB_TAIL_CHARS) return text;
	const path = artifactPath(text);
	const where = path ? ` Full output saved to ${path}.` : "";
	return `${text.slice(0, STUB_HEAD_CHARS)}\n[... stubbed.${where}]\n${text.slice(-STUB_TAIL_CHARS)}`;
}

function clearedText(text: string): string {
	const path = artifactPath(text);
	const where = path ? `, saved at ${path}` : "";
	return `[Output cleared: ${text.length.toLocaleString("en-US")} chars${where}]`;
}

function replaceText(message: AgentMessage, text: string): AgentMessage {
	let replaced = false;
	const content: AgentContentBlock[] = [];
	for (const block of message.content) {
		if (block.type === "text" && !replaced) {
			content.push({ type: "text", text });
			replaced = true;
			continue;
		}
		if (block.type === "text") continue;
		content.push(block);
	}
	if (!replaced) content.push({ type: "text", text });
	return { ...message, content };
}
