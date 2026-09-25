import { describe, expect, test } from "vitest";
import {
	describeAgentStartFailure,
	isAgentStartMessage,
	repairAgentStartMessage,
} from "../../src/protocol/worker-guards";

const settings = {
	wireFormat: "openai-chat-completions" as const,
	apiKey: "k",
	chatEndpointUrl: "https://example.com/v1/chat/completions",
	model: "m",
};

function start(history: unknown[]) {
	return {
		type: "agentStart" as const,
		runId: "r",
		sessionId: "s",
		task: "next",
		userMessageId: "u",
		history,
		resolvedTask: "next",
		skillCatalog: "",
		activatedSkills: [] as string[],
		settings,
	};
}

describe("agentStart transcript repair", () => {
	test("accepts an empty history", () => {
		expect(isAgentStartMessage(start([]))).toBe(true);
		expect(describeAgentStartFailure(start([]))).toBeNull();
	});

	test("repairs tool calls that lost their arguments across postMessage", () => {
		const raw = start([
			{
				entryId: "tool",
				turnNumber: 1,
				message: {
					role: "assistant",
					content: [
						{
							type: "tool_call",
							id: "call-1",
							name: "run_js",
							arguments: undefined,
						},
					],
					api: "sdk",
					provider: "sdk",
					model: "m",
					stopReason: "tool_call",
					timestamp: 1,
					usage: { input: 1, output: 1 },
				},
			},
		]);
		expect(isAgentStartMessage(raw)).toBe(false);
		const repaired = repairAgentStartMessage(raw);
		expect(repaired?.history).toEqual([
			{
				entryId: "tool",
				turnNumber: 1,
				message: {
					role: "assistant",
					content: [
						{
							type: "tool_call",
							id: "call-1",
							name: "run_js",
							arguments: {},
						},
					],
					api: "sdk",
					provider: "sdk",
					model: "m",
					stopReason: "tool_use",
					timestamp: 1,
					usage: {
						input: 1,
						output: 1,
						cache_read: 0,
						cache_write: 0,
						total_tokens: 0,
					},
				},
			},
		]);
	});

	test("drops a transcript entry that cannot be replayed and still starts", () => {
		const raw = start([
			{
				entryId: "ok",
				turnNumber: 1,
				message: {
					role: "user",
					content: [{ type: "text", text: "Earlier" }],
					timestamp: 1,
				},
			},
			{ entryId: "bad" },
		]);
		expect(isAgentStartMessage(raw)).toBe(false);
		const repaired = repairAgentStartMessage(raw);
		expect(repaired?.history.map((entry) => entry.entryId)).toEqual(["ok"]);
	});

	test("names a settings field instead of throwing", () => {
		const raw = start([]);
		const broken = {
			...raw,
			settings: { ...settings, wireFormat: "anthropic" },
		};
		expect(repairAgentStartMessage(broken)).toBeNull();
		expect(describeAgentStartFailure(broken)).toContain("settings.wireFormat");
	});
});
