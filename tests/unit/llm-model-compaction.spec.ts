import type { AgentMessage } from "@pi-oxide/pi-host-web";
import type {
	LlmChunk,
	LlmContext,
	LlmResult,
} from "@pi-oxide/pi-host-web/raw";
import { describe, expect, test } from "vitest";
import {
	createLlmModel,
	type LlmStreamerLike,
} from "../../src/worker/llm-model";
import type { LlmStream } from "../../src/worker/llm-streamer";

function streamFor(result: LlmResult): LlmStream {
	async function* chunks(): AsyncGenerator<LlmChunk> {}
	return { chunks: chunks(), result: Promise.resolve(result) };
}

function successResult(text: string): LlmResult {
	return {
		Ok: {
			content: [{ type: "text", text }],
			api: "test",
			provider: "test",
			model: "test-model",
			stop_reason: "end_turn",
			timestamp: 1,
			usage: {
				input: 0,
				output: 0,
				cache_read: 0,
				cache_write: 0,
				total_tokens: 0,
			},
		},
	};
}

const messages: AgentMessage[] = [
	{
		id: "user-1",
		role: "user",
		content: [{ type: "text", text: "Keep this key decision." }],
	},
];

describe("createLlmModel compaction summarizer", () => {
	test("summarizes history without tools and keeps the summary instruction", async () => {
		const contexts: LlmContext[] = [];
		const streamer: LlmStreamerLike = {
			call: async (context) => {
				contexts.push(context);
				return streamFor(successResult("Key decision preserved."));
			},
		};
		const model = createLlmModel(streamer, {
			id: "test-model",
			contextWindow: 128_000,
			maxTokens: 4_096,
		});
		if (!model.summarize) throw new Error("model summarizer is missing");

		await expect(model.summarize(messages)).resolves.toBe(
			"Key decision preserved.",
		);
		expect(contexts).toHaveLength(1);
		expect(contexts[0]?.tools).toEqual([]);
		expect(contexts[0]?.system_prompt).toContain("external side effects");
		expect(contexts[0]?.messages).toHaveLength(1);
		const sent = JSON.stringify(contexts[0]?.messages);
		expect(sent).toContain("Keep this key decision.");
		expect(sent).not.toContain('"role":"tool_result"');
	});

	test("keeps a lossy extract when the model returns no summary text", async () => {
		const model = createLlmModel(
			{ call: async () => streamFor(successResult("  \n")) },
			{ id: "test-model", contextWindow: 128_000, maxTokens: 4_096 },
		);
		if (!model.summarize) throw new Error("model summarizer is missing");

		const summary = await model.summarize(messages);
		expect(summary).toContain("Keep this key decision.");
		expect(summary).toContain("Summary model returned no text");
	});

	test("truncates oversized tool results before asking the model", async () => {
		const page = `PAGE${"x".repeat(100_000)}`;
		const contexts: LlmContext[] = [];
		const model = createLlmModel(
			{
				call: async (context) => {
					contexts.push(context);
					return streamFor(successResult("Jobs noted."));
				},
			},
			{ id: "test-model", contextWindow: 128_000, maxTokens: 4_096 },
		);
		if (!model.summarize) throw new Error("model summarizer is missing");
		await expect(
			model.summarize([
				...messages,
				{
					id: "call-1",
					role: "assistant",
					content: [
						{
							type: "tool_call",
							id: "call-1",
							name: "run_js",
							arguments: { code: "page" },
						},
					],
				},
				{
					id: "result-1",
					role: "tool_result",
					tool_call_id: "call-1",
					content: [{ type: "text", text: page }],
				},
			]),
		).resolves.toBe("Jobs noted.");
		const sent = JSON.stringify(contexts[0]?.messages);
		expect(sent).not.toContain(page);
		expect(sent).toContain("characters omitted");
		expect(sent.length).toBeLessThan(20_000);
	});

	test("retries a smaller summary after context overflow, then continues from an extract", async () => {
		const overflow: LlmResult = {
			Err: {
				error: {
					code: "api_error",
					message:
						"Your input exceeds the context window of this model. Please adjust your input and try again.",
				},
				aborted: false,
			},
		};
		let calls = 0;
		const model = createLlmModel(
			{
				call: async () => {
					calls += 1;
					return streamFor(overflow);
				},
			},
			{ id: "test-model", contextWindow: 128_000, maxTokens: 4_096 },
		);
		if (!model.summarize) throw new Error("model summarizer is missing");
		const summary = await model.summarize(messages);
		expect(calls).toBe(2);
		expect(summary).toContain("Keep this key decision.");
		expect(summary).toContain("context window");
		expect(summary).toContain("api_error");
	});

	test("folds an earlier summary into the next chunk", async () => {
		const contexts: LlmContext[] = [];
		const model = createLlmModel(
			{
				call: async (context) => {
					contexts.push(context);
					return streamFor(successResult(`part ${contexts.length}`));
				},
			},
			{ id: "test-model", contextWindow: 128_000, maxTokens: 4_096 },
		);
		if (!model.summarize) throw new Error("model summarizer is missing");
		const history: AgentMessage[] = Array.from({ length: 20 }, (_, index) => ({
			id: `user-${index}`,
			role: "user",
			content: [
				{
					type: "text",
					text: `decision ${index} ${"n".repeat(3_000)}`,
				},
			],
		}));
		await expect(model.summarize(history)).resolves.toBe("part 2");
		expect(contexts.length).toBeGreaterThan(1);
		expect(JSON.stringify(contexts[1]?.messages)).toContain("part 1");
		expect(JSON.stringify(contexts[1]?.messages)).toContain("previous-summary");
	});

	test("continues after a provider failure and still cancels", async () => {
		const failure: LlmResult = {
			Err: {
				error: { code: "network_error", message: "offline" },
				aborted: false,
			},
		};
		const model = createLlmModel(
			{ call: async () => streamFor(failure) },
			{ id: "test-model", contextWindow: 128_000, maxTokens: 4_096 },
		);
		if (!model.summarize) throw new Error("model summarizer is missing");
		const summary = await model.summarize(messages);
		expect(summary).toContain("Keep this key decision.");
		expect(summary).toContain("network_error: offline");

		const cancelledModel = createLlmModel(
			{ call: async () => streamFor(successResult("late summary")) },
			{ id: "test-model", contextWindow: 128_000, maxTokens: 4_096 },
		);
		if (!cancelledModel.summarize) {
			throw new Error("model summarizer is missing");
		}
		const abortController = new AbortController();
		abortController.abort();
		await expect(
			cancelledModel.summarize(messages, abortController.signal),
		).rejects.toThrow("Summary request was cancelled");
	});

	test("retries the streaming call the agent actually uses after context overflow", async () => {
		let calls = 0;
		const model = createLlmModel(
			{
				call: async () => {
					calls += 1;
					if (calls === 1) {
						async function* chunks(): AsyncGenerator<LlmChunk> {
							yield {
								kind: "error",
								message:
									"context_length_exceeded: Your input exceeds the context window of this model",
							};
						}
						return {
							chunks: chunks(),
							result: Promise.resolve({
								Err: {
									error: {
										code: "api_error",
										message:
											"Your input exceeds the context window of this model",
									},
									aborted: false,
								},
							}),
						};
					}
					return streamFor(successResult("recovered"));
				},
			},
			{ id: "test-model", contextWindow: 128_000, maxTokens: 4_096 },
		);
		if (!model.generateStream) throw new Error("streaming model is missing");
		const events = [];
		for await (const event of model.generateStream({
			instructions: "continue",
			messages,
			tools: [],
		})) {
			events.push(event);
		}
		expect(calls).toBe(2);
		expect(events.some((event) => event.type === "done")).toBe(true);
	});

	test("retries one live call after the provider rejects the context size", async () => {
		let calls = 0;
		const model = createLlmModel(
			{
				call: async () => {
					calls += 1;
					if (calls === 1) {
						return streamFor({
							Err: {
								error: {
									code: "context_length_exceeded",
									message:
										"Your input exceeds the context window of this model",
								},
								aborted: false,
							},
						});
					}
					return streamFor(successResult("recovered"));
				},
			},
			{ id: "test-model", contextWindow: 128_000, maxTokens: 4_096 },
		);
		const response = await model.generate({
			instructions: "continue",
			messages,
			tools: [],
		});
		expect(calls).toBe(2);
		expect(response.content).toEqual([
			expect.objectContaining({ type: "text", text: "recovered" }),
		]);
	});

	test("stubs an older page on a live call and keeps the newest", async () => {
		const page = `HEAD${"P".repeat(4_000)}TAIL`;
		const contexts: LlmContext[] = [];
		const model = createLlmModel(
			{
				call: async (context) => {
					contexts.push(context);
					return streamFor(successResult("ok"));
				},
			},
			{ id: "test-model", contextWindow: 128_000, maxTokens: 4_096 },
		);
		await model.generate({
			instructions: "continue",
			messages: [
				{
					id: "user-1",
					role: "user",
					content: [{ type: "text", text: "Keep this key decision." }],
				},
				{
					id: "old",
					role: "tool_result",
					tool_call_id: "old",
					content: [{ type: "text", text: page }],
				},
				{
					id: "a",
					role: "tool_result",
					tool_call_id: "a",
					content: [{ type: "text", text: "recent-a" }],
				},
				{
					id: "b",
					role: "tool_result",
					tool_call_id: "b",
					content: [{ type: "text", text: "recent-b" }],
				},
				{
					id: "c",
					role: "tool_result",
					tool_call_id: "c",
					content: [{ type: "text", text: "recent-c" }],
				},
			],
			tools: [],
		});
		const sent = JSON.stringify(contexts[0]?.messages);
		expect(sent).toContain("Keep this key decision.");
		expect(sent).toContain("recent-c");
		expect(sent).toContain("stubbed");
		expect(sent).not.toContain("P".repeat(4_000));
	});

	test("reports compaction around the summary request", async () => {
		const active: boolean[] = [];
		const model = createLlmModel(
			{ call: async () => streamFor(successResult("Key decision preserved.")) },
			{
				id: "test-model",
				contextWindow: 128_000,
				maxTokens: 4_096,
				onCompaction: (value) => active.push(value),
			},
		);
		if (!model.summarize) throw new Error("model summarizer is missing");
		await model.summarize(messages);
		expect(active).toEqual([true, false]);
	});

	test("clears compaction when the summary is cancelled mid-request", async () => {
		const active: boolean[] = [];
		const controller = new AbortController();
		const model = createLlmModel(
			{
				call: async () => {
					controller.abort();
					return streamFor(successResult("late"));
				},
			},
			{
				id: "test-model",
				contextWindow: 128_000,
				maxTokens: 4_096,
				onCompaction: (value) => active.push(value),
			},
		);
		if (!model.summarize) throw new Error("model summarizer is missing");
		await expect(model.summarize(messages, controller.signal)).rejects.toThrow(
			"Summary request was cancelled",
		);
		expect(active).toEqual([true, false]);
	});

	test("does not flash compaction when the request is already cancelled", async () => {
		const active: boolean[] = [];
		const controller = new AbortController();
		controller.abort();
		const model = createLlmModel(
			{ call: async () => streamFor(successResult("unused")) },
			{
				id: "test-model",
				contextWindow: 128_000,
				maxTokens: 4_096,
				onCompaction: (value) => active.push(value),
			},
		);
		if (!model.summarize) throw new Error("model summarizer is missing");
		await expect(model.summarize(messages, controller.signal)).rejects.toThrow(
			"Summary request was cancelled",
		);
		expect(active).toEqual([]);
	});
});
