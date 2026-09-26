import { describe, expect, test } from "vitest";
import {
	buildResponsesRequestBody,
	encodeAssistantMessage,
	encodeReasoningItem,
	sanitizeOpenAISchema,
	toResponsesInput,
	toResponsesTools,
	visibleAssistantText,
} from "../../src/worker/openai-responses-wire";

describe("sanitizeOpenAISchema", () => {
	test("adds properties and required on objects that omit them", () => {
		const schema = sanitizeOpenAISchema({
			type: "object",
			properties: {
				code: { type: "string" },
				params: { type: "object", description: "free-form" },
			},
		});
		expect(schema.required).toEqual([]);
		const properties = schema.properties as Record<
			string,
			Record<string, unknown>
		>;
		expect(properties.params).toMatchObject({
			type: "object",
			properties: {},
			required: [],
			description: "free-form",
		});
		expect(properties.code).toMatchObject({ type: "string" });
	});

	test("keeps an existing required array", () => {
		const schema = sanitizeOpenAISchema({
			type: "object",
			properties: { path: { type: "string" } },
			required: ["path"],
		});
		expect(schema.required).toEqual(["path"]);
	});
});

describe("toResponsesTools", () => {
	test("uses the flat Responses function shape", () => {
		const tools = toResponsesTools([
			{
				name: "run_js",
				label: "run_js",
				description: "run",
				parameters: {
					type: "object",
					properties: { code: { type: "string" } },
				},
				execution_mode: "sequential",
			},
		]);
		expect(tools).toEqual([
			{
				type: "function",
				name: "run_js",
				description: "run",
				parameters: {
					type: "object",
					properties: { code: { type: "string" } },
					required: [],
				},
			},
		]);
	});
});

describe("toResponsesInput", () => {
	test("splits call id and item id for tool replay", () => {
		const input = toResponsesInput([
			{
				role: "assistant",
				content: [
					{
						type: "tool_call",
						id: "call_1|fc_abc",
						name: "run_js",
						arguments: { code: "1" },
					},
				],
				timestamp: 1,
				api: "openai",
				provider: "openai",
				model: "gpt-4o",
				stop_reason: "tool_use",
				usage: {
					input: 0,
					output: 0,
					cache_read: 0,
					cache_write: 0,
					total_tokens: 0,
				},
			},
			{
				role: "tool_result",
				tool_call_id: "call_1|fc_abc",
				tool_name: "run_js",
				content: [{ type: "text", text: "ok" }],
				is_error: false,
				timestamp: 2,
			},
		]);
		expect(input).toEqual([
			{
				type: "function_call",
				call_id: "call_1",
				id: "fc_abc",
				name: "run_js",
				arguments: JSON.stringify({ code: "1" }),
			},
			{
				type: "function_call_output",
				call_id: "call_1",
				output: "ok",
			},
		]);
	});
});

describe("reasoning replay", () => {
	test("puts the reasoning item ahead of the function call it covered", () => {
		const reasoning = encodeReasoningItem({
			type: "reasoning",
			id: "rs_1",
			encrypted_content: "cipher",
		});
		const message = encodeAssistantMessage({
			id: "msg_real",
			text: "hello",
			phase: "commentary",
		});
		const input = toResponsesInput([
			{
				role: "assistant",
				content: [
					{ type: "text", text: reasoning },
					{ type: "text", text: message },
					{
						type: "tool_call",
						id: "call_1|fc_abc",
						name: "run_js",
						arguments: { code: "1" },
					},
				],
				timestamp: 1,
				api: "openai",
				provider: "openai",
				model: "gpt-5.4",
				stop_reason: "tool_use",
				usage: {
					input: 0,
					output: 0,
					cache_read: 0,
					cache_write: 0,
					total_tokens: 0,
				},
			},
		]);
		expect(input[0]).toMatchObject({
			type: "reasoning",
			id: "rs_1",
			encrypted_content: "cipher",
		});
		expect(input[1]).toMatchObject({
			type: "message",
			id: "msg_real",
			phase: "commentary",
			content: [{ type: "output_text", text: "hello" }],
		});
		expect(input[2]).toMatchObject({
			type: "function_call",
			id: "fc_abc",
			call_id: "call_1",
		});
		expect(
			visibleAssistantText([
				{ type: "text", text: reasoning },
				{ type: "text", text: message },
			]),
		).toBe("hello");
	});
});

describe("buildResponsesRequestBody", () => {
	test("omits max_output_tokens for Codex and sets store false", () => {
		const body = buildResponsesRequestBody({
			model: "gpt-5.4",
			instructions: "be helpful",
			input: "hi",
			stream: true,
			maxOutputTokens: 16,
			codex: true,
		});
		expect(body.store).toBe(false);
		expect(body.max_output_tokens).toBeUndefined();
		expect(body.instructions).toBe("be helpful");
		expect(body.include).toEqual(["reasoning.encrypted_content"]);
	});

	test("sets max_output_tokens for the API-key Responses endpoint", () => {
		const body = buildResponsesRequestBody({
			model: "gpt-4o",
			input: "ping",
			stream: false,
			maxOutputTokens: 16,
			codex: false,
		});
		expect(body.max_output_tokens).toBe(16);
		expect(body.instructions).toBeUndefined();
	});
});
