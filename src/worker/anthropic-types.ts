/**
 * Anthropic wire-format types — never exported beyond the worker folder.
 */

export type AnthropicContentBlock =
	| { type: "text"; text: string }
	| {
			type: "tool_use";
			id: string;
			name: string;
			input: Record<string, unknown>;
	  }
	| {
			type: "tool_result";
			tool_use_id: string;
			content: string | AnthropicContentBlock[];
			is_error?: boolean;
	  };

export interface AnthropicMessage {
	role: "user" | "assistant";
	content: string | AnthropicContentBlock[];
}

export interface AnthropicTool {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
}

export type AnthropicStreamEvent =
	| { type: "message_start"; message: unknown }
	| {
			type: "content_block_start";
			index: number;
			content_block:
				| { type: "text"; text: string }
				| {
						type: "tool_use";
						id: string;
						name: string;
						input: Record<string, unknown>;
				  };
	  }
	| {
			type: "content_block_delta";
			index: number;
			delta:
				| { type: "text_delta"; text: string }
				| { type: "input_json_delta"; partial_json: string };
	  }
	| { type: "content_block_stop"; index: number }
	| {
			type: "message_delta";
			delta: { stop_reason: string | null; stop_sequence: string | null };
			usage?: { output_tokens?: number };
	  }
	| { type: "message_stop" };

export function isStreamEvent(value: unknown): value is AnthropicStreamEvent {
	if (typeof value !== "object" || value === null) return false;
	const type = (value as { type?: unknown }).type;
	return (
		type === "message_start" ||
		type === "content_block_start" ||
		type === "content_block_delta" ||
		type === "content_block_stop" ||
		type === "message_delta" ||
		type === "message_stop"
	);
}
