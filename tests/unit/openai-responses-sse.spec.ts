import { describe, expect, test } from "vitest";
import { createResponsesStream } from "../../src/worker/openai-responses-sse";

function frame(event: unknown): string {
	return `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function streamOf(chunks: string[]): ReadableStream {
	let index = 0;
	return new ReadableStream({
		pull(controller) {
			if (index >= chunks.length) {
				controller.close();
				return;
			}
			controller.enqueue(new TextEncoder().encode(chunks[index]));
			index += 1;
		},
	});
}

describe("createResponsesStream", () => {
	test("accumulates output text", async () => {
		const stream = streamOf([
			frame({ type: "response.output_text.delta", delta: "hello" }),
			frame({ type: "response.output_text.delta", delta: " world" }),
			frame({
				type: "response.completed",
				response: { status: "completed" },
			}),
		]);
		const { chunks, result } = createResponsesStream(stream, "gpt-4o");
		const kinds: string[] = [];
		let text = "";
		for await (const chunk of chunks) {
			kinds.push(chunk.kind);
			if (chunk.kind === "text_delta") text += chunk.text;
		}
		expect(text).toBe("hello world");
		expect(kinds).toContain("done");
		const final = await result;
		expect(final).toMatchObject({
			Ok: {
				stop_reason: "end_turn",
				content: [{ type: "text", text: "hello world" }],
			},
		});
	});

	test("assembles a function call from argument deltas", async () => {
		const stream = streamOf([
			frame({
				type: "response.output_item.added",
				item: {
					type: "function_call",
					id: "fc_1",
					call_id: "call_1",
					name: "run_js",
					arguments: "",
				},
			}),
			frame({
				type: "response.function_call_arguments.delta",
				item_id: "fc_1",
				delta: '{"code":',
			}),
			frame({
				type: "response.function_call_arguments.delta",
				item_id: "fc_1",
				delta: '"1"}',
			}),
			frame({
				type: "response.completed",
				response: { status: "completed" },
			}),
		]);
		const { chunks, result } = createResponsesStream(stream, "gpt-5.4");
		for await (const _chunk of chunks) {
			// Drain.
		}
		const final = await result;
		expect(final).toMatchObject({
			Ok: {
				stop_reason: "tool_use",
				content: [
					{
						type: "tool_call",
						id: "call_1|fc_1",
						name: "run_js",
						arguments: { code: "1" },
					},
				],
			},
		});
	});

	test("keeps a reasoning item for the next turn and does not stream it as text", async () => {
		const stream = streamOf([
			frame({
				type: "response.output_item.done",
				item: {
					type: "reasoning",
					id: "rs_1",
					encrypted_content: "cipher",
					summary: [],
				},
			}),
			frame({ type: "response.output_text.delta", delta: "hi" }),
			frame({
				type: "response.output_item.done",
				item: {
					type: "message",
					id: "msg_real",
					role: "assistant",
					status: "completed",
					phase: "commentary",
					content: [{ type: "output_text", text: "hi", annotations: [] }],
				},
			}),
			frame({
				type: "response.completed",
				response: { status: "completed" },
			}),
		]);
		const { chunks, result } = createResponsesStream(stream, "gpt-5.4");
		let text = "";
		for await (const chunk of chunks) {
			if (chunk.kind === "text_delta") text += chunk.text;
		}
		expect(text).toBe("hi");
		const final = await result;
		expect(final).toMatchObject({
			Ok: {
				content: [
					{
						type: "text",
						text: expect.stringContaining('"id":"rs_1"'),
					},
					{
						type: "text",
						text: expect.stringContaining('"id":"msg_real"'),
					},
				],
			},
		});
	});
});
