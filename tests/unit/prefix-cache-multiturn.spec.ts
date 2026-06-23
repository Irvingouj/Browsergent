import type {
	AgentMessage,
	LlmContext,
	ToolDefinition,
} from "@pi-oxide/pi-host-web/raw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AnthropicProvider } from "../../src/worker/anthropic";
import { composeSystemPrompt } from "../../src/worker/anthropic-prompts";

// ── SSE mock helpers ──────────────────────────────────────────────

type SSEEvent = { event: string; data: unknown };

function sseStream(events: SSEEvent[]): ReadableStream<Uint8Array> {
	const text = events
		.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
		.join("");
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(text));
			controller.close();
		},
	});
}

function textResponseSSE(text: string): ReadableStream<Uint8Array> {
	return sseStream([
		{ event: "message_start", data: { type: "message_start", message: {} } },
		{
			event: "content_block_start",
			data: {
				type: "content_block_start",
				index: 0,
				content_block: { type: "text", text: "" },
			},
		},
		{
			event: "content_block_delta",
			data: {
				type: "content_block_delta",
				index: 0,
				delta: { type: "text_delta", text },
			},
		},
		{
			event: "content_block_stop",
			data: { type: "content_block_stop", index: 0 },
		},
		{
			event: "message_delta",
			data: {
				type: "message_delta",
				delta: { stop_reason: "end_turn", stop_sequence: null },
			},
		},
		{ event: "message_stop", data: { type: "message_stop" } },
	]);
}

function toolCallResponseSSE(
	id: string,
	name: string,
	args: Record<string, unknown>,
): ReadableStream<Uint8Array> {
	return sseStream([
		{ event: "message_start", data: { type: "message_start", message: {} } },
		{
			event: "content_block_start",
			data: {
				type: "content_block_start",
				index: 0,
				content_block: { type: "tool_use", id, name, input: {} },
			},
		},
		{
			event: "content_block_delta",
			data: {
				type: "content_block_delta",
				index: 0,
				delta: { type: "input_json_delta", partial_json: JSON.stringify(args) },
			},
		},
		{
			event: "content_block_stop",
			data: { type: "content_block_stop", index: 0 },
		},
		{
			event: "message_delta",
			data: {
				type: "message_delta",
				delta: { stop_reason: "tool_use", stop_sequence: null },
			},
		},
		{ event: "message_stop", data: { type: "message_stop" } },
	]);
}

// ── Mock Anthropic server ─────────────────────────────────────────

interface CapturedBody {
	system: string;
	messages: unknown[];
	tools: unknown[];
}

class MockAnthropicServer {
	capturedBodies: CapturedBody[] = [];
	private plan: ((idx: number) => ReadableStream<Uint8Array>) | null = null;

	setResponsePlan(plan: (idx: number) => ReadableStream<Uint8Array>): void {
		this.plan = plan;
	}

	mockFetch = vi.fn(async (_url: string, init: RequestInit) => {
		const body = JSON.parse(init.body as string) as {
			system: string;
			messages: unknown[];
			tools: unknown[];
		};
		this.capturedBodies.push({
			system: body.system,
			messages: body.messages,
			tools: body.tools,
		});
		return {
			ok: true,
			status: 200,
			body: this.plan!(this.capturedBodies.length - 1),
		};
	});

	prefixStability(): {
		systemStable: boolean;
		messagePrefixStable: boolean[];
	} {
		const systemStable =
			this.capturedBodies.length <= 1 ||
			this.capturedBodies.every(
				(b) => b.system === this.capturedBodies[0]!.system,
			);
		const messagePrefixStable: boolean[] = [];
		for (let i = 1; i < this.capturedBodies.length; i++) {
			const prev = this.capturedBodies[i - 1]!.messages;
			const cur = this.capturedBodies[i]!.messages;
			let stable = true;
			for (let j = 0; j < prev.length; j++) {
				if (JSON.stringify(cur[j]) !== JSON.stringify(prev[j])) {
					stable = false;
					break;
				}
			}
			messagePrefixStable.push(stable);
		}
		return { systemStable, messagePrefixStable };
	}
}

// ── Message fixtures (raw WASM AgentMessage shape) ────────────────

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

function assistantMsg(text: string): AgentMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "anthropic",
		provider: "anthropic",
		model: "test-model",
		stop_reason: "end_turn",
		timestamp: 1700000001000,
		usage: { ...USAGE },
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
		tool_name: "run_js",
		content: [{ type: "text", text }],
		is_error: false,
		timestamp: 1700000002000,
	};
}

const TOOLS: ToolDefinition[] = [
	{
		name: "run_js",
		label: "run_js",
		description: "Execute JS code",
		parameters: { type: "object", properties: { code: { type: "string" } } },
		execution_mode: "sequential",
	},
];

const SYSTEM = "You are a test agent.";

function ctx(messages: AgentMessage[], system = SYSTEM): LlmContext {
	return { system_prompt: system, messages, tools: TOOLS };
}

async function drain(stream: {
	chunks: AsyncGenerator;
	result: Promise<unknown>;
}): Promise<void> {
	for await (const _chunk of stream.chunks) {
		// exhaust
	}
	await stream.result;
}

// ── Tests ─────────────────────────────────────────────────────────

describe("prefix cache: multi-turn wire stability", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("5-turn dialogue: system + message prefix byte-identical across turns", async () => {
		const server = new MockAnthropicServer();
		server.setResponsePlan(() => textResponseSSE("OK"));
		globalThis.fetch = server.mockFetch as unknown as typeof globalThis.fetch;

		const provider = new AnthropicProvider({
			apiKey: "test",
			model: "test-model",
		});

		const turns: AgentMessage[] = [];

		for (let t = 0; t < 5; t++) {
			turns.push(userMsg(`User message ${t}`));
			await drain(await provider.call(ctx([...turns])));
			turns.push(assistantMsg(`Assistant reply ${t}`));
		}

		expect(server.capturedBodies).toHaveLength(5);
		const { systemStable, messagePrefixStable } = server.prefixStability();
		expect(systemStable).toBe(true);
		expect(messagePrefixStable).toEqual([true, true, true, true]);
	});

	test("tool-call loop: prefix stable across 3 tool iterations + final answer", async () => {
		const server = new MockAnthropicServer();
		server.setResponsePlan((idx) => {
			if (idx < 3) {
				return toolCallResponseSSE(`call_${idx}`, "run_js", {
					code: "return 1",
				});
			}
			return textResponseSSE("Done");
		});
		globalThis.fetch = server.mockFetch as unknown as typeof globalThis.fetch;

		const provider = new AnthropicProvider({
			apiKey: "test",
			model: "test-model",
		});

		const messages: AgentMessage[] = [
			userMsg("Run three tool calls then summarize."),
		];

		// Turn 0: LLM calls run_js → tool result added
		await drain(await provider.call(ctx([...messages])));
		messages.push(
			assistantToolCallMsg("call_0", "run_js", { code: "return 1" }),
		);
		messages.push(toolResultMsg("call_0", "echoed: return 1; // result: 1"));

		// Turn 1
		await drain(await provider.call(ctx([...messages])));
		messages.push(
			assistantToolCallMsg("call_1", "run_js", { code: "return 2" }),
		);
		messages.push(toolResultMsg("call_1", "echoed: return 2; // result: 2"));

		// Turn 2
		await drain(await provider.call(ctx([...messages])));
		messages.push(
			assistantToolCallMsg("call_2", "run_js", { code: "return 3" }),
		);
		messages.push(toolResultMsg("call_2", "echoed: return 3; // result: 3"));

		// Turn 3: final text answer
		await drain(await provider.call(ctx([...messages])));
		messages.push(assistantMsg("All three calls completed successfully."));

		expect(server.capturedBodies).toHaveLength(4);
		const { systemStable, messagePrefixStable } = server.prefixStability();
		expect(systemStable).toBe(true);
		expect(messagePrefixStable).toEqual([true, true, true]);

		// Tool results survive untruncated in the last request
		const lastMessages = server.capturedBodies[3]!.messages as Array<{
			content: unknown;
		}>;
		const allJson = JSON.stringify(lastMessages);
		expect(allJson).toContain("echoed: return 1");
		expect(allJson).toContain("echoed: return 2");
		expect(allJson).toContain("echoed: return 3");
		expect(allJson).not.toContain("[truncated]");
	});

	test("skill catalog in system prompt stays stable across turns", async () => {
		const server = new MockAnthropicServer();
		server.setResponsePlan(() => textResponseSSE("OK"));
		globalThis.fetch = server.mockFetch as unknown as typeof globalThis.fetch;

		const provider = new AnthropicProvider({
			apiKey: "test",
			model: "test-model",
		});

		const system = composeSystemPrompt("## available_skills\ncapability-check");
		const turns: AgentMessage[] = [];

		for (let t = 0; t < 3; t++) {
			turns.push(userMsg(`Turn ${t}`));
			await drain(await provider.call(ctx([...turns], system)));
			turns.push(assistantMsg(`Reply ${t}`));
		}

		expect(server.capturedBodies).toHaveLength(3);
		const { systemStable, messagePrefixStable } = server.prefixStability();
		expect(systemStable).toBe(true);
		expect(messagePrefixStable).toEqual([true, true]);
		// Verify the catalog is actually present in the system prompt
		expect(server.capturedBodies[0]!.system).toContain("capability-check");
	});

	test("tools array is byte-identical across turns", async () => {
		const server = new MockAnthropicServer();
		server.setResponsePlan(() => textResponseSSE("OK"));
		globalThis.fetch = server.mockFetch as unknown as typeof globalThis.fetch;

		const provider = new AnthropicProvider({
			apiKey: "test",
			model: "test-model",
		});

		const turns: AgentMessage[] = [];
		for (let t = 0; t < 3; t++) {
			turns.push(userMsg(`Turn ${t}`));
			await drain(await provider.call(ctx([...turns])));
			turns.push(assistantMsg(`Reply ${t}`));
		}

		const tools0 = JSON.stringify(server.capturedBodies[0]!.tools);
		for (let i = 1; i < server.capturedBodies.length; i++) {
			expect(JSON.stringify(server.capturedBodies[i]!.tools)).toBe(tools0);
		}
	});
});
