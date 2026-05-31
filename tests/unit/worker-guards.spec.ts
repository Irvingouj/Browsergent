import { describe, expect, test } from "vitest";
import { isStaleRunId } from "../../src/controllers/worker-bridge";
import {
	isAgentSessionState,
	isBrowsergentError,
	isConversationMessage,
} from "../../src/protocol/worker-guards";

describe("isBrowsergentError", () => {
	test("rejects an invalid error code", () => {
		const bad = { code: "not_a_real_code", message: "oops" };
		expect(isBrowsergentError(bad)).toBe(false);
	});

	test("accepts a valid error code", () => {
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

describe("isConversationMessage", () => {
	test("accepts valid user message", () => {
		expect(isConversationMessage({ role: "user", content: "hi" })).toBe(true);
	});

	test("accepts valid assistant message", () => {
		expect(isConversationMessage({ role: "assistant", content: "hi" })).toBe(
			true,
		);
	});

	test("rejects invalid role", () => {
		expect(isConversationMessage({ role: "system", content: "hi" })).toBe(false);
	});

	test("rejects non-string content", () => {
		expect(isConversationMessage({ role: "user", content: 42 })).toBe(false);
	});
});

describe("isAgentSessionState", () => {
	test("accepts valid message", () => {
		expect(
			isAgentSessionState({
				type: "agentSessionState",
				runId: "run-1",
				sessionState: {},
			}),
		).toBe(true);
	});

	test("rejects invalid type", () => {
		expect(
			isAgentSessionState({
				type: "notAgentSessionState",
				runId: "run-1",
				sessionState: {},
			}),
		).toBe(false);
	});

	test("rejects non-string runId", () => {
		expect(
			isAgentSessionState({
				type: "agentSessionState",
				runId: 42,
				sessionState: {},
			}),
		).toBe(false);
	});

	test("rejects non-object sessionState", () => {
		expect(
			isAgentSessionState({
				type: "agentSessionState",
				runId: "run-1",
				sessionState: "string",
			}),
		).toBe(false);
		expect(
			isAgentSessionState({
				type: "agentSessionState",
				runId: "run-1",
				sessionState: null,
			}),
		).toBe(false);
	});

	test("rejects non-object input", () => {
		expect(isAgentSessionState("string")).toBe(false);
		expect(isAgentSessionState(42)).toBe(false);
		expect(isAgentSessionState(null)).toBe(false);
	});
});
