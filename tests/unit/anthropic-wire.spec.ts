import { describe, expect, test } from "vitest";
import {
	contentToText,
	toAnthropicContent,
	toAnthropicMessages,
	toAnthropicTools,
	toStopReason,
} from "../../src/worker/anthropic-wire";

describe("contentToText", () => {
	test("extracts text from content blocks", () => {
		const blocks = [
			{ type: "text" as const, text: "hello" },
			{ type: "tool_call" as const, id: "tc1", name: "run_js", arguments: {} },
			{ type: "text" as const, text: "world" },
		];
		expect(contentToText(blocks)).toBe("hello\nworld");
	});

	test("returns empty string when no text blocks", () => {
		const blocks = [
			{ type: "tool_call" as const, id: "tc1", name: "run_js", arguments: {} },
		];
		expect(contentToText(blocks)).toBe("");
	});
});

describe("toAnthropicContent", () => {
	test("converts text block to Anthropic text", () => {
		const result = toAnthropicContent({ type: "text", text: "hello" });
		expect(result).toEqual({ type: "text", text: "hello" });
	});

	test("converts tool_call block to Anthropic tool_use", () => {
		const result = toAnthropicContent({
			type: "tool_call",
			id: "tc1",
			name: "run_js",
			arguments: { code: "1+1" },
		});
		expect(result).toEqual({
			type: "tool_use",
			id: "tc1",
			name: "run_js",
			input: { code: "1+1" },
		});
	});

	test("converts tool_call with non-object arguments to empty object", () => {
		const result = toAnthropicContent({
			type: "tool_call",
			id: "tc1",
			name: "run_js",
			arguments: "not-an-object",
		});
		expect(result).toEqual({
			type: "tool_use",
			id: "tc1",
			name: "run_js",
			input: {},
		});
	});

	test("converts image block to text placeholder", () => {
		const result = toAnthropicContent({
			type: "image",
			media_type: "image/png",
			data: "base64data",
		});
		expect(result).toEqual({ type: "text", text: "[image: image/png]" });
	});
});

describe("toAnthropicMessages", () => {
	test("converts user message with single text to string content", () => {
		const messages = [
			{
				role: "user" as const,
				content: [{ type: "text" as const, text: "hello" }],
				timestamp: 1,
			},
		];
		const result = toAnthropicMessages(messages);
		expect(result).toEqual([{ role: "user", content: "hello" }]);
	});

	test("converts user message with mixed content to array content", () => {
		const messages = [
			{
				role: "user" as const,
				content: [
					{ type: "text" as const, text: "hello" },
					{
						type: "tool_call" as const,
						id: "tc1",
						name: "run_js",
						arguments: {},
					},
				],
				timestamp: 1,
			},
		];
		const result = toAnthropicMessages(messages);
		expect(result).toEqual([
			{
				role: "user",
				content: [
					{ type: "text", text: "hello" },
					{ type: "tool_use", id: "tc1", name: "run_js", input: {} },
				],
			},
		]);
	});

	test("merges consecutive user messages into one", () => {
		// Strict Anthropic-compatible endpoints reject consecutive same-role
		// messages ("roles must alternate"). When the core drops an empty
		// assistant between two user turns, the wire layer must merge them.
		const messages = [
			{
				role: "user" as const,
				content: [{ type: "text" as const, text: "first" }],
				timestamp: 1,
			},
			{
				role: "user" as const,
				content: [{ type: "text" as const, text: "second" }],
				timestamp: 2,
			},
			{
				role: "assistant" as const,
				content: [{ type: "text" as const, text: "reply" }],
				timestamp: 3,
			},
		];
		const result = toAnthropicMessages(messages);
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({ role: "user", content: "first\nsecond" });
		expect(result[1]).toEqual({
			role: "assistant",
			content: [{ type: "text", text: "reply" }],
		});
	});

	test("converts assistant message to array content", () => {
		const messages = [
			{
				role: "assistant" as const,
				content: [{ type: "text" as const, text: "hi there" }],
				timestamp: 2,
			},
		];
		const result = toAnthropicMessages(messages);
		expect(result).toEqual([
			{ role: "assistant", content: [{ type: "text", text: "hi there" }] },
		]);
	});

	test("converts tool_result to user tool_result block", () => {
		const messages = [
			{
				role: "tool_result" as const,
				content: [{ type: "text" as const, text: "42" }],
				tool_call_id: "tc1",
				timestamp: 3,
			},
		];
		const result = toAnthropicMessages(messages);
		expect(result).toEqual([
			{
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "tc1",
						content: "42",
						is_error: undefined,
					},
				],
			},
		]);
	});

	test("coalesces consecutive tool_results into a single user message", () => {
		// Reproduces the failed LLM request: an assistant turn emits multiple
		// parallel tool_use blocks, and the core returns one tool_result message
		// per call. Anthropic requires all tool_results for a single assistant
		// turn to be in ONE user message — sending two consecutive user messages
		// triggers: "tool_use ids were found without tool_result blocks
		// immediately after".
		const messages = [
			{
				role: "user" as const,
				content: [{ type: "text" as const, text: "go" }],
				timestamp: 1,
			},
			{
				role: "assistant" as const,
				content: [
					{ type: "text" as const, text: "calling two tools" },
					{
						type: "tool_call" as const,
						id: "tc1",
						name: "snapshot",
						arguments: {},
					},
					{
						type: "tool_call" as const,
						id: "tc2",
						name: "file_list",
						arguments: {},
					},
				],
				timestamp: 2,
			},
			{
				role: "tool_result" as const,
				content: [{ type: "text" as const, text: "snap result" }],
				tool_call_id: "tc1",
				timestamp: 3,
			},
			{
				role: "tool_result" as const,
				content: [{ type: "text" as const, text: "files" }],
				tool_call_id: "tc2",
				timestamp: 4,
			},
		];
		const result = toAnthropicMessages(messages);
		// Expected: user, assistant, then ONE user with both tool_results.
		expect(result).toHaveLength(3);
		expect(result[2]).toEqual({
			role: "user",
			content: [
				{
					type: "tool_result",
					tool_use_id: "tc1",
					content: "snap result",
					is_error: undefined,
				},
				{
					type: "tool_result",
					tool_use_id: "tc2",
					content: "files",
					is_error: undefined,
				},
			],
		});
	});
});

describe("toAnthropicTools", () => {
	test("converts tool definitions with object parameters", () => {
		const tools = [
			{
				name: "run_js",
				description: "Run JS code",
				parameters: { type: "object", properties: {} },
			},
		];
		const result = toAnthropicTools(tools);
		expect(result).toEqual([
			{
				name: "run_js",
				description: "Run JS code",
				input_schema: { type: "object", properties: {} },
			},
		]);
	});

	test("defaults non-object parameters to { type: object }", () => {
		const tools = [
			{
				name: "run_js",
				description: "Run JS code",
				parameters: null,
			},
		];
		const result = toAnthropicTools(tools);
		expect(result).toEqual([
			{
				name: "run_js",
				description: "Run JS code",
				input_schema: { type: "object" },
			},
		]);
	});
});

describe("toStopReason", () => {
	test("maps known stop reasons", () => {
		expect(toStopReason("end_turn")).toBe("end_turn");
		expect(toStopReason("max_tokens")).toBe("max_tokens");
		expect(toStopReason("tool_use")).toBe("tool_use");
	});

	test("defaults unknown reasons to end_turn", () => {
		expect(toStopReason("unknown_reason")).toBe("end_turn");
		expect(toStopReason(null)).toBe("end_turn");
	});
});
