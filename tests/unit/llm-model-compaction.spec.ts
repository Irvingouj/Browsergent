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
	});

	test("rejects blank summaries rather than committing a destructive compaction", async () => {
		const model = createLlmModel(
			{ call: async () => streamFor(successResult("  \n")) },
			{ id: "test-model", contextWindow: 128_000, maxTokens: 4_096 },
		);
		if (!model.summarize) throw new Error("model summarizer is missing");

		await expect(model.summarize(messages)).rejects.toThrow(
			"Summary model returned no text",
		);
	});

	test("surfaces provider failures and cancellation", async () => {
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
		await expect(model.summarize(messages)).rejects.toThrow(
			"Summary request failed: network_error",
		);

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
});
