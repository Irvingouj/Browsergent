import type { AgentMessage, ToolDefinition } from "@pi-oxide/pi-host-web/raw";
import { describe, expect, test } from "vitest";
import {
	toOpenAIMessages,
	toOpenAITools,
	toStopReason,
} from "../../src/worker/openai-wire";

const USAGE = {
	input: 0,
	output: 0,
	cache_read: 0,
	cache_write: 0,
	total_tokens: 0,
};

function userMsg(text: string): AgentMessage {
	return {
		role: "user",
		content: [{ type: "text", text }],
		timestamp: 1700000000000,
	};
}

function assistantToolCallMsg(
	id: string,
	name: string,
	args: Record<string, unknown>,
): AgentMessage {
	return {
		role: "assistant",
		content: [{ type: "tool_call", id, name, arguments: args }],
		api: "anthropic",
		provider: "anthropic",
		model: "test-model",
		stop_reason: "tool_use",
		timestamp: 1700000001000,
		usage: { ...USAGE },
	};
}

function toolResultMsg(id: string, text: string): AgentMessage {
	return {
		role: "tool_result",
		tool_call_id: id,
		tool_name: "",
		content: [{ type: "text", text }],
		is_error: false,
		timestamp: 1700000002000,
	};
}

describe("toOpenAIMessages", () => {
	test("emits system message from systemPrompt", () => {
		const out = toOpenAIMessages([userMsg("hi")], "be helpful");
		expect(out[0]).toMatchObject({ role: "system", content: "be helpful" });
	});

	test("user text → {role:user, content}", () => {
		const out = toOpenAIMessages([userMsg("hi")], "sys");
		expect(out[1]).toMatchObject({ role: "user", content: "hi" });
	});

	test("assistant with tool_call → tool_calls array with JSON-string args", () => {
		const out = toOpenAIMessages(
			[assistantToolCallMsg("call_1", "run_js", { code: "x=1" })],
			undefined,
		);
		const msg = out[0];
		if (!msg || msg.role !== "assistant" || !msg.tool_calls) {
			throw new Error("expected assistant tool_calls");
		}
		expect(msg.tool_calls[0]?.id).toBe("call_1");
		expect(msg.tool_calls[0]?.function.name).toBe("run_js");
		expect(msg.tool_calls[0]?.function.arguments).toBe('{"code":"x=1"}');
	});

	test("tool_result → {role:tool, tool_call_id, content}", () => {
		const out = toOpenAIMessages([toolResultMsg("call_1", "ok")], undefined);
		expect(out[0]).toMatchObject({
			role: "tool",
			tool_call_id: "call_1",
			content: "ok",
		});
	});

	test("empty assistant turn gets placeholder content (OpenAI rejects empty)", () => {
		const emptyAssistant: AgentMessage = {
			role: "assistant",
			content: [],
			api: "anthropic",
			provider: "anthropic",
			model: "m",
			stop_reason: "end_turn",
			timestamp: 1,
			usage: { ...USAGE },
		};
		const out = toOpenAIMessages([emptyAssistant], undefined);
		expect(out[0]?.content).toBe(" ");
	});

	test("assistant with text + tool_calls carries both", () => {
		const out = toOpenAIMessages(
			[
				{
					role: "assistant",
					content: [
						{ type: "text", text: "thinking" },
						{ type: "tool_call", id: "c1", name: "f", arguments: {} },
					],
					api: "anthropic",
					provider: "anthropic",
					model: "m",
					stop_reason: "tool_use",
					timestamp: 1,
					usage: { ...USAGE },
				},
			],
			undefined,
		);
		const msg = out[0];
		if (!msg || msg.role !== "assistant") throw new Error("expected assistant");
		expect(msg.content).toBe("thinking");
		expect(msg.tool_calls?.[0]?.id).toBe("c1");
	});
});

describe("toOpenAITools", () => {
	test("wraps each tool under {type:function, function:{...}}", () => {
		const tools: ToolDefinition[] = [
			{
				name: "run_js",
				label: "run_js",
				description: "run js",
				parameters: {
					type: "object",
					properties: { code: { type: "string" } },
				},
				execution_mode: "sequential",
			},
		];
		const out = toOpenAITools(tools);
		expect(out).toEqual([
			{
				type: "function",
				function: {
					name: "run_js",
					description: "run js",
					parameters: {
						type: "object",
						properties: { code: { type: "string" } },
					},
				},
			},
		]);
	});
});

describe("toStopReason", () => {
	test("maps openai finish_reasons to core StopReason", () => {
		expect(toStopReason("tool_calls")).toBe("tool_use");
		expect(toStopReason("length")).toBe("max_tokens");
		expect(toStopReason("stop")).toBe("end_turn");
		expect(toStopReason("content_filter")).toBe("end_turn");
		expect(toStopReason(null)).toBe("end_turn");
		expect(toStopReason(undefined)).toBe("end_turn");
	});
});
