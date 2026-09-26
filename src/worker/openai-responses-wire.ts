/**
 * OpenAI Responses API wire conversion.
 *
 * Official OpenAI and ChatGPT Codex both speak this shape. Chat Completions
 * (DeepSeek and other compatible endpoints) stays in openai-wire.ts.
 *
 * Tool schemas are lowered to the subset OpenAI actually accepts: every object
 * has `properties` and a `required` array. `strict` stays off so optional
 * fields can stay optional.
 */

import type { AgentMessage, ToolDefinition } from "@pi-oxide/pi-host-web/raw";
import { contentToText } from "./openai-wire";

export interface ResponsesFunctionTool {
	type: "function";
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

/** Marks a text block that carries a Responses reasoning item, not chat text. */
export const REASONING_ITEM_PREFIX = "browsergent.reasoning-item\n";
/** Marks a text block that carries an assistant message plus its server id. */
export const ASSISTANT_MESSAGE_PREFIX = "browsergent.assistant-message\n";

export type ResponsesReasoningItem = {
	type: "reasoning";
	id: string;
	encrypted_content?: string;
	summary?: unknown;
	content?: unknown;
};

export type ResponsesInputItem =
	| {
			role: "user";
			content: Array<{ type: "input_text"; text: string }>;
	  }
	| {
			type: "message";
			role: "assistant";
			status: "completed";
			id?: string;
			phase?: string;
			content: Array<{ type: "output_text"; text: string; annotations: [] }>;
	  }
	| ResponsesReasoningItem
	| {
			type: "function_call";
			call_id: string;
			name: string;
			arguments: string;
			id?: string;
	  }
	| {
			type: "function_call_output";
			call_id: string;
			output: string;
	  };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeNode(
	schema: Record<string, unknown>,
): Record<string, unknown> {
	const copy: Record<string, unknown> = { ...schema };
	if (copy.type === "object" || isRecord(copy.properties)) {
		copy.type = "object";
		const props = isRecord(copy.properties) ? copy.properties : {};
		const next: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(props)) {
			next[key] = isRecord(value) ? sanitizeNode(value) : value;
		}
		copy.properties = next;
		if (!Array.isArray(copy.required)) copy.required = [];
	}
	if (copy.type === "array" && isRecord(copy.items)) {
		copy.items = sanitizeNode(copy.items);
	}
	return copy;
}

/** Make a JSON schema acceptable to OpenAI function calling. */
export function sanitizeOpenAISchema(schema: unknown): Record<string, unknown> {
	if (!isRecord(schema)) {
		return { type: "object", properties: {}, required: [] };
	}
	return sanitizeNode(schema);
}

export function toResponsesTools(
	tools: ToolDefinition[],
): ResponsesFunctionTool[] {
	return tools.map((tool) => ({
		type: "function",
		name: tool.name,
		description: tool.description,
		parameters: sanitizeOpenAISchema(tool.parameters),
	}));
}

function splitToolCallId(id: string): { callId: string; itemId?: string } {
	const pipe = id.indexOf("|");
	if (pipe === -1) return { callId: id };
	const callId = id.slice(0, pipe);
	const itemId = id.slice(pipe + 1);
	return { callId, itemId: itemId.length > 0 ? itemId : undefined };
}

export function joinToolCallId(callId: string, itemId?: string): string {
	return itemId ? `${callId}|${itemId}` : callId;
}

export function encodeReasoningItem(item: ResponsesReasoningItem): string {
	return REASONING_ITEM_PREFIX + JSON.stringify(item);
}

export function decodeReasoningItem(
	text: string,
): ResponsesReasoningItem | null {
	if (!text.startsWith(REASONING_ITEM_PREFIX)) return null;
	try {
		const parsed: unknown = JSON.parse(
			text.slice(REASONING_ITEM_PREFIX.length),
		);
		if (!isRecord(parsed) || parsed.type !== "reasoning") return null;
		if (typeof parsed.id !== "string" || parsed.id.length === 0) return null;
		return parsed as ResponsesReasoningItem;
	} catch {
		return null;
	}
}

export function isReasoningItemText(text: string): boolean {
	return text.startsWith(REASONING_ITEM_PREFIX);
}

export interface StoredAssistantMessage {
	id: string;
	text: string;
	phase?: string;
}

export function encodeAssistantMessage(
	message: StoredAssistantMessage,
): string {
	return ASSISTANT_MESSAGE_PREFIX + JSON.stringify(message);
}

export function decodeAssistantMessage(
	text: string,
): StoredAssistantMessage | null {
	if (!text.startsWith(ASSISTANT_MESSAGE_PREFIX)) return null;
	try {
		const parsed: unknown = JSON.parse(
			text.slice(ASSISTANT_MESSAGE_PREFIX.length),
		);
		if (!isRecord(parsed) || typeof parsed.id !== "string" || !parsed.id) {
			return null;
		}
		if (typeof parsed.text !== "string") return null;
		const phase = typeof parsed.phase === "string" ? parsed.phase : undefined;
		return { id: parsed.id, text: parsed.text, phase };
	} catch {
		return null;
	}
}

/** Assistant text the user should see. Wire carriers are unwrapped or omitted. */
export function visibleAssistantText(
	blocks: ReadonlyArray<{ type: string; text?: string }>,
): string {
	let text = "";
	for (const block of blocks) {
		if (block.type !== "text" || typeof block.text !== "string") continue;
		if (isReasoningItemText(block.text)) continue;
		const message = decodeAssistantMessage(block.text);
		text += message ? message.text : block.text;
	}
	return text;
}

function needsEncryptedReasoning(model: string, codex: boolean): boolean {
	return codex || /^(gpt-5|o\d)/.test(model);
}

export function toResponsesInput(
	messages: AgentMessage[],
): ResponsesInputItem[] {
	const result: ResponsesInputItem[] = [];

	for (const msg of messages) {
		switch (msg.role) {
			case "user": {
				result.push({
					role: "user",
					content: [{ type: "input_text", text: contentToText(msg.content) }],
				});
				break;
			}
			case "assistant": {
				// Replay server ids. A reasoning item's required following item is
				// the original msg_ or fc_ id, and a completed message without
				// that id is rejected.
				let visible = "";
				const flushVisible = (): void => {
					if (!visible) return;
					result.push({
						type: "message",
						role: "assistant",
						status: "completed",
						content: [{ type: "output_text", text: visible, annotations: [] }],
					});
					visible = "";
				};
				for (const block of msg.content) {
					if (block.type === "text") {
						const reasoning = decodeReasoningItem(block.text);
						if (reasoning) {
							flushVisible();
							result.push(reasoning);
							continue;
						}
						const carried = decodeAssistantMessage(block.text);
						if (carried) {
							flushVisible();
							result.push({
								type: "message",
								role: "assistant",
								status: "completed",
								id: carried.id,
								...(carried.phase ? { phase: carried.phase } : {}),
								content: [
									{
										type: "output_text",
										text: carried.text,
										annotations: [],
									},
								],
							});
							continue;
						}
						visible += block.text;
						continue;
					}
					if (block.type !== "tool_call") continue;
					flushVisible();
					const { callId, itemId } = splitToolCallId(block.id);
					const args = isRecord(block.arguments)
						? JSON.stringify(block.arguments)
						: String(block.arguments ?? "");
					result.push({
						type: "function_call",
						call_id: callId,
						name: block.name,
						arguments: args,
						...(itemId ? { id: itemId } : {}),
					});
				}
				flushVisible();
				break;
			}
			case "tool_result": {
				const { callId } = splitToolCallId(msg.tool_call_id);
				result.push({
					type: "function_call_output",
					call_id: callId,
					output: contentToText(msg.content),
				});
				break;
			}
		}
	}

	return result;
}

export function buildResponsesRequestBody(options: {
	model: string;
	instructions?: string;
	input: ResponsesInputItem[] | string;
	tools?: ResponsesFunctionTool[];
	stream: boolean;
	maxOutputTokens?: number;
	codex: boolean;
}): Record<string, unknown> {
	const body: Record<string, unknown> = {
		model: options.model,
		stream: options.stream,
		store: false,
		input: options.input,
	};
	const instructions =
		options.instructions?.trim() ||
		(options.codex ? "You are a helpful assistant." : "");
	if (instructions) body.instructions = instructions;
	if (options.tools && options.tools.length > 0) {
		body.tools = options.tools;
		body.tool_choice = "auto";
		body.parallel_tool_calls = true;
	}
	if (!options.codex && options.maxOutputTokens !== undefined) {
		body.max_output_tokens = options.maxOutputTokens;
	}
	if (needsEncryptedReasoning(options.model, options.codex)) {
		body.include = ["reasoning.encrypted_content"];
	}
	return body;
}

export function responsesOutputText(json: unknown): string | null {
	if (!isRecord(json)) return null;
	if (typeof json.output_text === "string" && json.output_text.trim()) {
		return json.output_text.trim();
	}
	if (!Array.isArray(json.output)) return null;
	const parts: string[] = [];
	for (const item of json.output) {
		if (!isRecord(item) || !Array.isArray(item.content)) continue;
		for (const part of item.content) {
			if (
				isRecord(part) &&
				part.type === "output_text" &&
				typeof part.text === "string"
			) {
				parts.push(part.text);
			}
		}
	}
	const text = parts.join("").trim();
	return text.length > 0 ? text : null;
}
