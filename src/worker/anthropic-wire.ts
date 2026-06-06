/**
 * Wire-format conversion helpers: SDK AgentMessage[] → Anthropic wire format.
 */

import type {
	AgentMessage,
	Content,
	StopReason,
	ToolDefinition,
} from "@pi-oxide/pi-host-web/raw";
import type {
	AnthropicContentBlock,
	AnthropicMessage,
	AnthropicTool,
} from "./anthropic-types";

export function contentToText(blocks: Content[]): string {
	return blocks
		.filter((b): b is { type: "text"; text: string } => b.type === "text")
		.map((b) => b.text)
		.join("\n");
}

export function toAnthropicContent(block: Content): AnthropicContentBlock {
	switch (block.type) {
		case "text":
			return { type: "text", text: block.text };
		case "tool_call":
			return {
				type: "tool_use",
				id: block.id,
				name: block.name,
				input:
					typeof block.arguments === "object" && block.arguments !== null
						? block.arguments
						: {},
			};
		case "image":
			return { type: "text", text: `[image: ${block.media_type}]` };
	}
}

export function toAnthropicMessages(
	messages: AgentMessage[],
): AnthropicMessage[] {
	const result: AnthropicMessage[] = [];

	for (const msg of messages) {
		switch (msg.role) {
			case "user": {
				if (msg.content.length === 1 && msg.content[0]?.type === "text") {
					result.push({
						role: "user",
						content: msg.content[0].text,
					});
				} else {
					result.push({
						role: "user",
						content: msg.content.map(toAnthropicContent),
					});
				}
				break;
			}
			case "assistant": {
				result.push({
					role: "assistant",
					content: msg.content.map(toAnthropicContent),
				});
				break;
			}
			case "tool_result": {
				const text = contentToText(msg.content);
				result.push({
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: msg.tool_call_id,
							content: text,
							is_error: msg.is_error,
						},
					],
				});
				break;
			}
		}
	}

	return result;
}

export function toAnthropicTools(tools: ToolDefinition[]): AnthropicTool[] {
	return tools.map((t) => ({
		name: t.name,
		description: t.description,
		input_schema:
			typeof t.parameters === "object" && t.parameters !== null
				? t.parameters
				: { type: "object" },
	}));
}

export function toStopReason(raw: string | null): StopReason {
	switch (raw) {
		case "end_turn":
			return "end_turn";
		case "max_tokens":
			return "max_tokens";
		case "tool_use":
			return "tool_use";
		default:
			return "end_turn";
	}
}
