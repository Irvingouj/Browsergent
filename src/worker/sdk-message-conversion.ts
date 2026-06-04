import type {
	AgentMessage,
	Content,
	ToolDefinition,
} from "@pi-oxide/pi-host-web/raw";
import { isToolErrorEnvelope, renderToolOutput } from "./tool-error-result";

function sdkMessageToWasmContent(
	block: import("@pi-oxide/pi-host-web").AgentContentBlock,
): Content {
	switch (block.type) {
		case "text":
			return { type: "text", text: block.text };
		case "tool_call":
			return {
				type: "tool_call",
				id: block.id,
				name: block.name,
				arguments: block.arguments,
			};
		case "image":
			return { type: "image", media_type: block.mimeType, data: block.data };
		default:
			return { type: "text", text: "" };
	}
}

export function sdkToWasmMessages(
	messages: import("@pi-oxide/pi-host-web").AgentMessage[],
): AgentMessage[] {
	return messages.map((msg): AgentMessage => {
		const content = msg.content.map(sdkMessageToWasmContent);
		const timestamp = msg.timestamp ?? Date.now();
		if (msg.role === "tool_result") {
			const isError = content.some(
				(c) => c.type === "text" && isToolErrorEnvelope(c.text),
			);
			const displayContent = isError
				? content.map((c) =>
						c.type === "text"
							? { type: "text" as const, text: renderToolOutput(c.text) }
							: c,
					)
				: content;
			return {
				role: "tool_result",
				tool_call_id: msg.tool_call_id ?? "",
				tool_name: "",
				content: displayContent,
				is_error: isError,
				timestamp,
			};
		}
		return { role: msg.role, content, timestamp } as AgentMessage;
	});
}

export function sdkToolToWasmTool(
	tools: import("@pi-oxide/pi-host-web").AgentToolDefinition[],
): ToolDefinition[] {
	return tools.map((t) => ({
		name: t.name,
		label: t.name,
		description: t.description,
		parameters: t.inputSchema as Record<string, unknown>,
		execution_mode: "sequential" as const,
	}));
}
