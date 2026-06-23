import { describe, expect, test } from "vitest";
import { toAnthropicMessages } from "../../src/worker/anthropic-wire";
import type { AgentMessage } from "@pi-oxide/pi-host-web/raw";

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

describe("toAnthropicMessages: prefix stability across growing turns", () => {
	test("alternating user/assistant: appending messages does not alter prefix", () => {
		const turn1: AgentMessage[] = [
			userMsg("Hello"),
			assistantMsg("Hi there"),
			userMsg("How are you?"),
		];
		const turn2: AgentMessage[] = [
			...turn1,
			assistantMsg("I'm good"),
			userMsg("Great"),
		];

		const out1 = toAnthropicMessages(turn1);
		const out2 = toAnthropicMessages(turn2);

		expect(out2.length).toBeGreaterThan(out1.length);
		for (let i = 0; i < out1.length; i++) {
			expect(JSON.stringify(out2[i])).toBe(JSON.stringify(out1[i]));
		}
	});

	test("tool_result merging: appending assistant after tool_result does not alter prefix", () => {
		const turn1: AgentMessage[] = [
			userMsg("Run a tool"),
			assistantToolCallMsg("call_0", "run_js", { code: "return 1" }),
			toolResultMsg("call_0", "result: 1"),
		];
		const turn2: AgentMessage[] = [
			...turn1,
			assistantMsg("The result was 1."),
		];

		const out1 = toAnthropicMessages(turn1);
		const out2 = toAnthropicMessages(turn2);

		// out1 has: user, assistant(tool_call), user(tool_result)
		// out2 has: user, assistant(tool_call), user(tool_result), assistant(text)
		// The first 3 messages must be byte-identical
		expect(out2.length).toBe(out1.length + 1);
		for (let i = 0; i < out1.length; i++) {
			expect(JSON.stringify(out2[i])).toBe(JSON.stringify(out1[i]));
		}
	});

	test("consecutive user messages merge identically when prefix is preserved", () => {
		// Two consecutive user messages (core dropped an empty assistant)
		const turn1: AgentMessage[] = [
			userMsg("First question"),
			userMsg("Second question"),
		];
		const turn2: AgentMessage[] = [
			...turn1,
			assistantMsg("Both answered"),
		];

		const out1 = toAnthropicMessages(turn1);
		const out2 = toAnthropicMessages(turn2);

		// out1: one merged user message
		// out2: same merged user message + assistant
		expect(out1.length).toBe(1);
		expect(out2.length).toBe(2);
		expect(JSON.stringify(out2[0])).toBe(JSON.stringify(out1[0]));
	});

	test("3-turn conversation: full prefix stability", () => {
		const base: AgentMessage[] = [
			userMsg("Turn 0"),
			assistantMsg("Reply 0"),
		];
		const turn1: AgentMessage[] = [...base, userMsg("Turn 1")];
		const turn2: AgentMessage[] = [
			...turn1,
			assistantMsg("Reply 1"),
			userMsg("Turn 2"),
		];

		const outBase = toAnthropicMessages(base);
		const out1 = toAnthropicMessages(turn1);
		const out2 = toAnthropicMessages(turn2);

		for (let i = 0; i < outBase.length; i++) {
			expect(JSON.stringify(out1[i])).toBe(JSON.stringify(outBase[i]));
		}
		for (let i = 0; i < out1.length; i++) {
			expect(JSON.stringify(out2[i])).toBe(JSON.stringify(out1[i]));
		}
	});
});