import type { AgentMessage } from "@pi-oxide/pi-host-web";
import { describe, expect, test } from "vitest";
import {
	estimateOutboundTokens,
	OutboundTiering,
} from "../../src/worker/model-context";

function toolResult(id: string, text: string): AgentMessage {
	return {
		id,
		role: "tool_result",
		tool_call_id: id,
		content: [{ type: "text", text }],
	};
}

function call(id: string, args: unknown): AgentMessage {
	return {
		id: `call-${id}`,
		role: "assistant",
		content: [{ type: "tool_call", id, name: "run_js", arguments: args }],
	};
}

const saved = (id: string, body: string) =>
	`${body}\n[... 1 characters omitted (2 total). Full output saved to /artifacts/${id}.txt — use file_read with offset/limit, or re-run with a narrower selector/extraction ...]\n${body}`;

describe("OutboundTiering", () => {
	test("keeps the three newest results and stubs the older one", () => {
		const page = "P".repeat(2_000);
		const tiering = new OutboundTiering();
		const sent = tiering.prepare(
			[
				toolResult("old", saved("tc_old", page)),
				toolResult("a", page),
				toolResult("b", page),
				toolResult("c", page),
			],
			{ maxContextTokens: 1_000_000 },
		);
		const old = sent[0]?.content[0];
		expect(old?.type === "text" ? old.text : "").toContain("stubbed");
		expect(old?.type === "text" ? old.text : "").toContain(
			"/artifacts/tc_old.txt",
		);
		expect(sent[3]).toBeDefined();
		const newest = sent[3]?.content[0];
		expect(newest?.type === "text" ? newest.text : "").toBe(page);
	});

	test("clears the oldest result until the request fits, and does not restore it", () => {
		const page = "Q".repeat(3_000);
		const tiering = new OutboundTiering();
		const messages = [
			call("old", { code: "x".repeat(2_000) }),
			toolResult("old", saved("tc_old", page)),
			call("new", { code: "keep me" }),
			toolResult("new", page),
		];
		const tight = tiering.prepare(messages, {
			maxContextTokens: 100,
			recentFull: 1,
			fraction: 0.7,
		});
		const cleared = tight[1]?.content[0];
		expect(cleared?.type === "text" ? cleared.text : "").toContain(
			"Output cleared",
		);
		expect(cleared?.type === "text" ? cleared.text : "").toContain(
			"/artifacts/tc_old.txt",
		);
		const oldCall = tight[0]?.content[0];
		expect(oldCall?.type === "tool_call" ? oldCall.arguments : {}).toEqual({
			_elided: true,
		});
		expect(estimateOutboundTokens(tight)).toBeLessThanOrEqual(70);

		const later = tiering.prepare(messages, {
			maxContextTokens: 1_000_000,
			recentFull: 3,
		});
		const still = later[1]?.content[0];
		expect(still?.type === "text" ? still.text : "").toContain(
			"Output cleared",
		);
	});

	test("never drops user text", () => {
		const user: AgentMessage = {
			id: "user-1",
			role: "user",
			content: [
				{
					type: "text",
					text: "no one password, no lawrance harvey",
				},
			],
		};
		const sent = new OutboundTiering().prepare(
			[user, toolResult("only", "Q".repeat(5_000))],
			{ maxContextTokens: 20, recentFull: 0, fraction: 0.7 },
		);
		expect(sent[0]).toBe(user);
	});
});
