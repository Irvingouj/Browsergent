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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
				input: isRecord(block.arguments) ? block.arguments : {},
			};
		case "image":
			return { type: "text", text: `[image: ${block.media_type}]` };
	}
}

export function toAnthropicMessages(
	messages: AgentMessage[],
): AnthropicMessage[] {
	const result: AnthropicMessage[] = [];

	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i];
		if (!msg) continue;
		switch (msg.role) {
		case "user": {
			// Merge consecutive user messages into one. Strict
			// Anthropic-compatible endpoints reject adjacent same-role
			// messages ("roles must alternate"). This arises when the core
			// drops an empty assistant message between two user turns.
			const blocks: AnthropicContentBlock[] = msg.content.map(
				toAnthropicContent,
			);
			let allSingleText =
				msg.content.length === 1 && msg.content[0]?.type === "text";
			while (
				i + 1 < messages.length &&
				messages[i + 1]?.role === "user"
			) {
				i++;
				const next = messages[i];
				if (next?.role !== "user") break;
				allSingleText =
					allSingleText &&
					next.content.length === 1 &&
					next.content[0]?.type === "text";
				blocks.push(...next.content.map(toAnthropicContent));
			}
			if (allSingleText) {
				result.push({
					role: "user",
					content: blocks
						.map((b) => (b.type === "text" ? b.text : ""))
						.join("\n"),
				});
			} else {
				result.push({ role: "user", content: blocks });
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
				// Gather consecutive tool_result messages into a single user
				// message. Anthropic requires all tool_results for a given
				// assistant turn to be in one user message; emitting one user
				// message per tool_result yields:
				//   "tool_use ids were found without tool_result blocks
				//    immediately after: <id>."
				const toolResults: AnthropicContentBlock[] = [
					{
						type: "tool_result",
						tool_use_id: msg.tool_call_id,
						content: contentToText(msg.content),
						is_error: msg.is_error,
					},
				];
				while (
					i + 1 < messages.length &&
					messages[i + 1]?.role === "tool_result"
				) {
					i++;
					const next = messages[i];
					if (next?.role !== "tool_result") break;
					toolResults.push({
						type: "tool_result",
						tool_use_id: next.tool_call_id,
						content: contentToText(next.content),
						is_error: next.is_error,
					});
				}
				result.push({ role: "user", content: toolResults });
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
