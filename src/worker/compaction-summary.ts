import type { AgentMessage } from "@pi-oxide/pi-host-web";

/** Head and tail kept for each tool result on the first summary attempt. */
const TOOL_RESULT_CHARS = 1_500;
/** Second attempt drops tool lines. User lines stay. */
const TOOL_RESULT_CHARS_RETRY = 0;
const CHUNK_CHARS = 48_000;
const CHUNK_CHARS_RETRY = 48_000;
const USER_CHARS = 4_000;
const ASSISTANT_CHARS = 2_000;
const TOOL_ARGS_CHARS = 300;
const EXTRACTIVE_TOTAL_CHARS = 12_000;

export interface SummaryAttempt {
	toolResultChars: number;
	chunkChars: number;
}

export const SUMMARY_ATTEMPTS: readonly SummaryAttempt[] = [
	{ toolResultChars: TOOL_RESULT_CHARS, chunkChars: CHUNK_CHARS },
	{ toolResultChars: TOOL_RESULT_CHARS_RETRY, chunkChars: CHUNK_CHARS_RETRY },
];

function textOf(message: AgentMessage): string {
	return message.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

function truncate(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	const omitted = text.length - maxChars;
	return `${text.slice(0, maxChars)}\n\n[... ${omitted} more characters truncated]`;
}

function truncateToolResult(text: string, maxChars: number): string {
	const path = text.match(/Full output saved to (\/artifacts\/\S+)/)?.[1];
	const pathLine = path ? `\nFull output saved to ${path}` : "";
	const budget = Math.max(0, maxChars - pathLine.length);
	const headLen = Math.floor(budget * 0.7);
	const tailLen = budget - headLen;
	if (text.length <= maxChars) return text;
	const omitted = text.length - headLen - tailLen;
	return `${text.slice(0, headLen)}\n[... ${omitted} characters omitted]${pathLine}\n${text.slice(-tailLen)}`;
}

function toolCallLines(message: AgentMessage): string[] {
	const lines: string[] = [];
	for (const block of message.content) {
		if (block.type !== "tool_call") continue;
		const args = truncate(
			JSON.stringify(block.arguments ?? {}),
			TOOL_ARGS_CHARS,
		);
		lines.push(`${block.name}(${args})`);
	}
	return lines;
}

/** One plain-text block per message, with tool bodies already capped. */
export function summaryBlocks(
	messages: AgentMessage[],
	toolResultChars: number,
): string[] {
	const blocks: string[] = [];
	for (const message of messages) {
		if (message.role === "user") {
			const text = textOf(message).trim();
			if (text) blocks.push(`[User]: ${truncate(text, USER_CHARS)}`);
			continue;
		}
		if (message.role === "assistant") {
			const text = textOf(message).trim();
			const calls = toolCallLines(message);
			if (text) blocks.push(`[Assistant]: ${truncate(text, ASSISTANT_CHARS)}`);
			if (calls.length > 0) {
				blocks.push(`[Assistant tool calls]: ${calls.join("; ")}`);
			}
			continue;
		}
		if (toolResultChars <= 0) continue;
		const text = textOf(message).trim();
		if (!text) continue;
		const name = message.tool_call_id ? ` ${message.tool_call_id}` : "";
		blocks.push(
			`[Tool result${name}]: ${truncateToolResult(text, toolResultChars)}`,
		);
	}
	return blocks;
}

export function packSummaryChunks(
	blocks: string[],
	maxChars: number,
): string[] {
	const chunks: string[] = [];
	let current = "";
	for (const block of blocks) {
		const piece = block.length > maxChars ? truncate(block, maxChars) : block;
		if (!current) {
			current = piece;
			continue;
		}
		if (current.length + 2 + piece.length > maxChars) {
			chunks.push(current);
			current = piece;
			continue;
		}
		current = `${current}\n\n${piece}`;
	}
	if (current) chunks.push(current);
	return chunks.length > 0 ? chunks : ["[No earlier conversation]"];
}

export function summaryUserText(
	chunk: string,
	previousSummary?: string,
): string {
	const parts: string[] = [];
	if (previousSummary) {
		parts.push(`<previous-summary>\n${previousSummary}\n</previous-summary>`);
	}
	parts.push(`<conversation>\n${chunk}\n</conversation>`);
	parts.push(
		previousSummary
			? "Update the previous summary so it includes this later part of the conversation. Return only the updated summary."
			: "Summarize the conversation above. Return only the summary text.",
	);
	return parts.join("\n\n");
}

/** Local summary used when the model cannot summarize. Never empty. */
export function extractiveSummary(
	messages: AgentMessage[],
	failure?: string,
): string {
	const users: string[] = [];
	const assistants: string[] = [];
	const tools: string[] = [];
	for (const message of messages) {
		if (message.role === "user") {
			const text = textOf(message).trim();
			if (text) users.push(truncate(text, 1_500));
			continue;
		}
		if (message.role === "assistant") {
			const text = textOf(message).trim();
			if (text) assistants.push(truncate(text, 1_500));
			for (const call of toolCallLines(message)) tools.push(call);
			continue;
		}
		const text = textOf(message).trim();
		if (text) {
			const id = message.tool_call_id ?? "tool";
			tools.push(`${id}: ${truncate(text, 300)}`);
		}
	}
	const parts = [
		failure
			? `Model summarization failed (${failure}). Continuing from a lossy extract of the earlier conversation.`
			: "Continuing from a lossy extract of the earlier conversation.",
	];
	if (users.length > 0) parts.push(`User:\n${users.join("\n")}`);
	if (assistants.length > 0) parts.push(`Assistant:\n${assistants.join("\n")}`);
	if (tools.length > 0) parts.push(`Tools:\n${tools.join("\n")}`);
	const text = parts.join("\n\n").trim();
	return truncate(
		text || "No earlier conversation to summarize.",
		EXTRACTIVE_TOTAL_CHARS,
	);
}
