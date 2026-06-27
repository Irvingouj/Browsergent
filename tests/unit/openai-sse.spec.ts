import { describe, expect, test } from "vitest";
import { createOpenAIStream } from "../../src/worker/openai-sse";

function sseData(payload: unknown): string {
	return `data: ${JSON.stringify(payload)}\n\n`;
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

function chunk(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		id: "chatcmpl-1",
		object: "chat.completion.chunk",
		choices: [{ index: 0, delta: {}, finish_reason: null, ...overrides }],
	};
}

describe("createOpenAIStream", () => {
	test("yields start, text_delta(s), done and accumulates text", async () => {
		const stream = createSseStream([
			sseData(chunk({ delta: { role: "assistant" } })),
			sseData(chunk({ delta: { content: "hello" } })),
			sseData(chunk({ delta: { content: " world" } })),
			sseData(chunk({ delta: {}, finish_reason: "stop" })),
		]);

		const { chunks, result } = createOpenAIStream(stream, "gpt-4o-mini");
		const emitted: unknown[] = [];
		for await (const c of chunks) emitted.push(c);

		const kinds = (emitted as Array<{ kind: string }>).map((e) => e.kind);
		expect(kinds).toEqual(["start", "text_delta", "text_delta", "done"]);

		const final = await result;
		if (!("Ok" in final)) throw new Error("expected Ok");
		expect(final.Ok.content).toEqual([{ type: "text", text: "hello world" }]);
		expect(final.Ok.stop_reason).toBe("end_turn");
	});

	test("accumulates tool_call deltas by index, parses JSON args", async () => {
		const stream = createSseStream([
			sseData(
				chunk({
					delta: {
						tool_calls: [
							{
								index: 0,
								id: "call_a",
								type: "function",
								function: { name: "run_js", arguments: "" },
							},
						],
					},
				}),
			),
			sseData(
				chunk({
					delta: {
						tool_calls: [{ index: 0, function: { arguments: '{"code":"' } }],
					},
				}),
			),
			sseData(
				chunk({
					delta: {
						tool_calls: [{ index: 0, function: { arguments: '1"}' } }],
					},
				}),
			),
			sseData(chunk({ delta: {}, finish_reason: "tool_calls" })),
		]);

		const { chunks, result } = createOpenAIStream(stream, "gpt-4o-mini");
		const emitted: unknown[] = [];
		for await (const c of chunks) emitted.push(c);
		// start, 2 tool_call_delta (empty initial args string emits nothing), done
		expect(emitted).toHaveLength(4);

		const final = await result;
		if (!("Ok" in final)) throw new Error("expected Ok");
		const toolBlock = final.Ok.content.find((b) => b.type === "tool_call");
		if (!toolBlock || toolBlock.type !== "tool_call") {
			throw new Error("expected tool_call content");
		}
		expect(toolBlock.id).toBe("call_a");
		expect(toolBlock.name).toBe("run_js");
		expect(toolBlock.arguments).toEqual({ code: "1" });
		expect(final.Ok.stop_reason).toBe("tool_use");
	});

	test("[DONE] sentinel terminates without error", async () => {
		const stream = createSseStream([
			sseData(chunk({ delta: { content: "hi" } })),
			"data: [DONE]\n\n",
		]);
		const { chunks, result } = createOpenAIStream(stream, "m");
		const emitted: unknown[] = [];
		for await (const c of chunks) emitted.push(c);
		expect((emitted as Array<{ kind: string }>)[1]).toMatchObject({
			kind: "text_delta",
		});
		const final = await result;
		if (!("Ok" in final)) throw new Error("expected Ok");
		expect(final.Ok.content).toEqual([{ type: "text", text: "hi" }]);
	});

	test("parallel tool calls accumulate by distinct index", async () => {
		const stream = createSseStream([
			sseData(
				chunk({
					delta: {
						tool_calls: [
							{ index: 0, id: "c0", function: { name: "a", arguments: "{}" } },
						],
					},
				}),
			),
			sseData(
				chunk({
					delta: {
						tool_calls: [
							{ index: 1, id: "c1", function: { name: "b", arguments: "{}" } },
						],
					},
				}),
			),
			sseData(chunk({ delta: {}, finish_reason: "tool_calls" })),
		]);
		const { result } = createOpenAIStream(stream, "m");
		const final = await result;
		if (!("Ok" in final)) throw new Error("expected Ok");
		const calls = final.Ok.content.filter((b) => b.type === "tool_call");
		expect(calls).toHaveLength(2);
		const ids = calls.map((c) => (c.type === "tool_call" ? c.id : null));
		expect(ids).toEqual(["c0", "c1"]);
	});
});
