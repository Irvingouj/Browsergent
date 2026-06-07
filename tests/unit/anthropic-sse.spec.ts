import { describe, expect, test } from "vitest";
import { createAnthropicStream } from "../../src/worker/anthropic-sse";

function sseEvent(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function createSseStream(chunks: string[]): ReadableStream {
	let index = 0;
	return new ReadableStream({
		pull(controller) {
			if (index >= chunks.length) {
				controller.close();
				return;
			}
			controller.enqueue(new TextEncoder().encode(chunks[index]));
			index++;
		},
	});
}

describe("createAnthropicStream", () => {
	test("yields start, text_delta, and done chunks", async () => {
		const stream = createSseStream([
			sseEvent("message_start", { type: "message_start", message: {} }),
			sseEvent("content_block_start", {
				type: "content_block_start",
				index: 0,
				content_block: { type: "text", text: "" },
			}),
			sseEvent("content_block_delta", {
				type: "content_block_delta",
				index: 0,
				delta: { type: "text_delta", text: "hello" },
			}),
			sseEvent("content_block_delta", {
				type: "content_block_delta",
				index: 0,
				delta: { type: "text_delta", text: " world" },
			}),
			sseEvent("message_delta", {
				type: "message_delta",
				delta: { stop_reason: "end_turn", stop_sequence: null },
			}),
		]);

		const { chunks, result } = createAnthropicStream(stream, "claude-3-haiku-20240307");
		const emitted: unknown[] = [];
		for await (const chunk of chunks) {
			emitted.push(chunk);
		}

		expect(emitted).toHaveLength(4);
		expect(emitted[0]).toMatchObject({ kind: "start" });
		expect(emitted[1]).toMatchObject({ kind: "text_delta", text: "hello" });
		expect(emitted[2]).toMatchObject({ kind: "text_delta", text: " world" });
		expect(emitted[3]).toMatchObject({ kind: "done" });

		const finalResult = await result;
		expect(finalResult).toMatchObject({
			Ok: {
				content: [{ type: "text", text: "hello world" }],
				stop_reason: "end_turn",
			},
		});
	});

	test("yields tool_call_delta for tool_use blocks", async () => {
		const stream = createSseStream([
			sseEvent("message_start", { type: "message_start", message: {} }),
			sseEvent("content_block_start", {
				type: "content_block_start",
				index: 0,
				content_block: { type: "tool_use", id: "tu1", name: "run_js", input: {} },
			}),
			sseEvent("content_block_delta", {
				type: "content_block_delta",
				index: 0,
				delta: { type: "input_json_delta", partial_json: '{"code":"1' },
			}),
			sseEvent("content_block_delta", {
				type: "content_block_delta",
				index: 0,
				delta: { type: "input_json_delta", partial_json: '+1"}' },
			}),
		]);

		const { chunks, result } = createAnthropicStream(stream, "claude-3-haiku-20240307");
		const emitted: unknown[] = [];
		for await (const chunk of chunks) {
			emitted.push(chunk);
		}

		expect(emitted).toHaveLength(4);
		expect(emitted[0]).toMatchObject({ kind: "start" });
		expect(emitted[1]).toMatchObject({
			kind: "tool_call_delta",
			tool_call_id: "tu1",
			delta: '{"code":"1',
		});
		expect(emitted[2]).toMatchObject({
			kind: "tool_call_delta",
			tool_call_id: "tu1",
			delta: '+1"}',
		});
		expect(emitted[3]).toMatchObject({ kind: "done" });

		const finalResult = await result;
		expect(finalResult).toMatchObject({
			Ok: {
				content: [
					{
						type: "tool_call",
						id: "tu1",
						name: "run_js",
						arguments: { code: "1+1" },
					},
				],
			},
		});
	});

	test("malformed JSON is skipped, not fatal", async () => {
		const stream = createSseStream([
			"event: message_start\ndata: not-json\n\n",
			sseEvent("message_start", { type: "message_start", message: {} }),
			sseEvent("content_block_delta", {
				type: "content_block_delta",
				index: 0,
				delta: { type: "text_delta", text: "ok" },
			}),
		]);

		const { chunks, result } = createAnthropicStream(stream, "claude-3-haiku-20240307");
		const emitted: unknown[] = [];
		for await (const chunk of chunks) {
			emitted.push(chunk);
		}

		expect(emitted).toHaveLength(3);
		expect(emitted[0]).toMatchObject({ kind: "start" });
		expect(emitted[1]).toMatchObject({ kind: "text_delta", text: "ok" });
		expect(emitted[2]).toMatchObject({ kind: "done" });

		const finalResult = await result;
		expect(finalResult).toMatchObject({
			Ok: { content: [{ type: "text", text: "ok" }] },
		});
	});

	test("handles signal abort by resolving with Err", async () => {
		const controller = new AbortController();
		const stream = createSseStream([
			sseEvent("message_start", { type: "message_start", message: {} }),
		]);

		const { chunks, result } = createAnthropicStream(
			stream,
			"claude-3-haiku-20240307",
			controller.signal,
		);
		controller.abort();

		const emitted: unknown[] = [];
		for await (const chunk of chunks) {
			emitted.push(chunk);
		}

		expect(emitted).toHaveLength(2);
		expect(emitted[0]).toMatchObject({ kind: "start" });
		expect(emitted[1]).toMatchObject({ kind: "done" });

		const finalResult = await result;
		expect(finalResult).toMatchObject({
			Err: {
				error: { code: "aborted", message: "Request aborted" },
				aborted: true,
			},
		});
	});

	test("handles tool_use with invalid JSON gracefully", async () => {
		const stream = createSseStream([
			sseEvent("message_start", { type: "message_start", message: {} }),
			sseEvent("content_block_start", {
				type: "content_block_start",
				index: 0,
				content_block: { type: "tool_use", id: "tu1", name: "run_js", input: {} },
			}),
			sseEvent("content_block_delta", {
				type: "content_block_delta",
				index: 0,
				delta: { type: "input_json_delta", partial_json: "not-json" },
			}),
		]);

		const { chunks, result } = createAnthropicStream(stream, "claude-3-haiku-20240307");
		for await (const _ of chunks) {
			// consume
		}

		const finalResult = await result;
		expect(finalResult).toMatchObject({
			Ok: {
				content: [
					{
						type: "tool_call",
						id: "tu1",
						name: "run_js",
						arguments: {},
					},
				],
			},
		});
	});
});
