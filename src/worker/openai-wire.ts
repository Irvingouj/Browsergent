/**
 * Wire-format conversion: SDK AgentMessage[] → OpenAI Chat Completions format.
 *
 * Key differences from Anthropic (see openai-types for the full delta table):
 * - System prompt becomes a {role:"system"} message, not a top-level field.
 * - Assistant tool use is `tool_calls: [{id,type,function:{name,arguments}}]`,
 *   not content blocks.
 * - Tool results are individual {role:"tool", tool_call_id, content} messages,
 *   not content blocks inside a user message.
 */

import type {
	AgentMessage,
	Content,
	StopReason,
	ToolDefinition,
} from "@pi-oxide/pi-host-web/raw";
import type {
	OpenAIMessage,
	OpenAIToolCall,
	OpenAIToolDefinition,
} from "./openai-types";

export function contentToText(blocks: Content[]): string {
	return blocks
		.filter((b): b is { type: "text"; text: string } => b.type === "text")
		.map((b) => b.text)
		.join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assistantToolCalls(content: Content[]): OpenAIToolCall[] {
	const calls: OpenAIToolCall[] = [];
	for (const block of content) {
		if (block.type !== "tool_call") continue;
		const args = isRecord(block.arguments)
			? JSON.stringify(block.arguments)
			: String(block.arguments ?? "");
		calls.push({
			id: block.id,
			type: "function",
			function: { name: block.name, arguments: args },
		});
	}
	return calls;
}

export function toOpenAIMessages(
	messages: AgentMessage[],
	systemPrompt?: string,
): OpenAIMessage[] {
	const result: OpenAIMessage[] = [];
	if (systemPrompt) {
		result.push({ role: "system", content: systemPrompt });
	}

	for (const msg of messages) {
		switch (msg.role) {
			case "user": {
				result.push({ role: "user", content: contentToText(msg.content) });
				break;
			}
			case "assistant": {
				const text = contentToText(msg.content);
				const toolCalls = assistantToolCalls(msg.content);
				const assistant: OpenAIMessage = { role: "assistant" };
				if (text) assistant.content = text;
				if (toolCalls.length > 0) assistant.tool_calls = toolCalls;
				// OpenAI requires assistant messages to carry either content or
				// tool_calls; an empty assistant turn is rejected. Emit a space
				// so the request stays valid.
				if (!text && toolCalls.length === 0) assistant.content = " ";
				result.push(assistant);
				break;
			}
			case "tool_result": {
				result.push({
					role: "tool",
					tool_call_id: msg.tool_call_id,
					content: contentToText(msg.content),
				});
				break;
			}
		}
	}

	return result;
}

export function toOpenAITools(tools: ToolDefinition[]): OpenAIToolDefinition[] {
	return tools.map((t) => ({
		type: "function",
		function: {
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		},
	}));
}

/** OpenAI finish_reason → core StopReason. */
export function toStopReason(raw: string | null | undefined): StopReason {
	switch (raw) {
		case "tool_calls":
			return "tool_use";
		case "length":
			return "max_tokens";
		default:
			return "end_turn";
	}
}
