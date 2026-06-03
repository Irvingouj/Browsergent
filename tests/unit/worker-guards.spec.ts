import { describe, expect, test } from "vitest";
import { isStaleRunId } from "../../src/controllers/worker-bridge";
import {
	isAgentMessageEnd,
	isBrowsergentError,
} from "../../src/protocol/worker-guards";

describe("isBrowsergentError", () => {
	test("accepts any string error code", () => {
		const bad = { code: "not_a_real_code", message: "oops" };
		expect(isBrowsergentError(bad)).toBe(true);
	});

	test("accepts a known error code", () => {
		const good = { code: "E_LLM_REQUEST", message: "API error" };
		expect(isBrowsergentError(good)).toBe(true);
	});

	test("rejects non-object input", () => {
		expect(isBrowsergentError("string")).toBe(false);
		expect(isBrowsergentError(42)).toBe(false);
		expect(isBrowsergentError(null)).toBe(false);
	});
});

describe("isStaleRunId", () => {
	test("treats any runId as stale when no active run exists", () => {
		expect(isStaleRunId("run-1", undefined)).toBe(true);
	});

	test("allows unknown runId through", () => {
		expect(isStaleRunId("unknown", undefined)).toBe(false);
		expect(isStaleRunId("unknown", "run-1")).toBe(false);
	});

	test("stale when runId differs from active", () => {
		expect(isStaleRunId("old-run", "new-run")).toBe(true);
	});

	test("fresh when runId matches active", () => {
		expect(isStaleRunId("run-1", "run-1")).toBe(false);
	});
});

describe("isAgentMessageEnd", () => {
	test("accepts valid agentMessageEnd", () => {
		expect(isAgentMessageEnd({ type: "agentMessageEnd", runId: "r1", messageId: "m1" })).toBe(true);
	});

	test("rejects wrong type", () => {
		expect(isAgentMessageEnd({ type: "agentMessage", runId: "r1", messageId: "m1" })).toBe(false);
	});

	test("rejects missing runId", () => {
		expect(isAgentMessageEnd({ type: "agentMessageEnd", messageId: "m1" })).toBe(false);
	});

	test("rejects missing messageId", () => {
		expect(isAgentMessageEnd({ type: "agentMessageEnd", runId: "r1" })).toBe(false);
	});

	test("rejects non-string runId", () => {
		expect(isAgentMessageEnd({ type: "agentMessageEnd", runId: 123, messageId: "m1" })).toBe(false);
	});

	test("rejects non-string messageId", () => {
		expect(isAgentMessageEnd({ type: "agentMessageEnd", runId: "r1", messageId: 123 })).toBe(false);
	});

	test("rejects non-object input", () => {
		expect(isAgentMessageEnd("string")).toBe(false);
		expect(isAgentMessageEnd(null)).toBe(false);
		expect(isAgentMessageEnd(undefined)).toBe(false);
	});
});
