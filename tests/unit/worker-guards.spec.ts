import { describe, expect, test } from "vitest";
import { isStaleRunId } from "../../src/controllers/worker-bridge";
import {
	isAgentDiagnosticEvent,
	isAgentMessageEnd,
	isBrowsergentError,
	isExtjsDocsError,
	isExtjsDocsRequest,
	isExtjsDocsResult,
	isLoadSkillError,
	isLoadSkillRequest,
	isLoadSkillResult,
} from "../../src/protocol/worker-guards";

describe("isAgentDiagnosticEvent", () => {
	test("accepts model response stop-reason diagnostics", () => {
		expect(
			isAgentDiagnosticEvent({
				kind: "model_response",
				timestamp: 1,
				providerStopReason: "tool_use",
				sdkStopReason: "tool_call",
				content: [],
			}),
		).toBe(true);
	});
});

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
		expect(
			isAgentMessageEnd({
				type: "agentMessageEnd",
				runId: "r1",
				messageId: "m1",
			}),
		).toBe(true);
	});

	test("rejects wrong type", () => {
		expect(
			isAgentMessageEnd({ type: "agentMessage", runId: "r1", messageId: "m1" }),
		).toBe(false);
	});

	test("rejects missing runId", () => {
		expect(
			isAgentMessageEnd({ type: "agentMessageEnd", messageId: "m1" }),
		).toBe(false);
	});

	test("rejects missing messageId", () => {
		expect(isAgentMessageEnd({ type: "agentMessageEnd", runId: "r1" })).toBe(
			false,
		);
	});

	test("rejects non-string runId", () => {
		expect(
			isAgentMessageEnd({
				type: "agentMessageEnd",
				runId: 123,
				messageId: "m1",
			}),
		).toBe(false);
	});

	test("rejects non-string messageId", () => {
		expect(
			isAgentMessageEnd({
				type: "agentMessageEnd",
				runId: "r1",
				messageId: 123,
			}),
		).toBe(false);
	});

	test("rejects non-object input", () => {
		expect(isAgentMessageEnd("string")).toBe(false);
		expect(isAgentMessageEnd(null)).toBe(false);
		expect(isAgentMessageEnd(undefined)).toBe(false);
	});
});

describe("isExtjsDocsRequest", () => {
	test("accepts valid json request", () => {
		expect(
			isExtjsDocsRequest({
				type: "extjsDocsRequest",
				id: "d1",
				format: "json",
			}),
		).toBe(true);
	});

	test("accepts valid markdown request", () => {
		expect(
			isExtjsDocsRequest({
				type: "extjsDocsRequest",
				id: "d1",
				format: "markdown",
			}),
		).toBe(true);
	});

	test("rejects invalid format", () => {
		expect(
			isExtjsDocsRequest({ type: "extjsDocsRequest", id: "d1", format: "xml" }),
		).toBe(false);
	});

	test("rejects missing id", () => {
		expect(
			isExtjsDocsRequest({ type: "extjsDocsRequest", format: "json" }),
		).toBe(false);
	});
});

describe("isExtjsDocsResult", () => {
	test("accepts valid result", () => {
		expect(
			isExtjsDocsResult({ type: "extjsDocsResult", id: "d1", docs: "{...}" }),
		).toBe(true);
	});

	test("rejects missing docs", () => {
		expect(isExtjsDocsResult({ type: "extjsDocsResult", id: "d1" })).toBe(
			false,
		);
	});
});

describe("isExtjsDocsError", () => {
	test("accepts valid error", () => {
		expect(
			isExtjsDocsError({ type: "extjsDocsError", id: "d1", error: "fail" }),
		).toBe(true);
	});

	test("rejects missing error", () => {
		expect(isExtjsDocsError({ type: "extjsDocsError", id: "d1" })).toBe(false);
	});
});

describe("isLoadSkillRequest", () => {
	test("accepts valid request without path", () => {
		expect(
			isLoadSkillRequest({
				type: "loadSkillRequest",
				id: "s1",
				skill: "capability-check",
			}),
		).toBe(true);
	});

	test("accepts valid request with path", () => {
		expect(
			isLoadSkillRequest({
				type: "loadSkillRequest",
				id: "s1",
				skill: "capability-check",
				path: "references/checklist.md",
			}),
		).toBe(true);
	});

	test("rejects missing skill", () => {
		expect(isLoadSkillRequest({ type: "loadSkillRequest", id: "s1" })).toBe(
			false,
		);
	});

	test("rejects non-string path", () => {
		expect(
			isLoadSkillRequest({
				type: "loadSkillRequest",
				id: "s1",
				skill: "x",
				path: 42,
			}),
		).toBe(false);
	});
});

describe("isLoadSkillResult", () => {
	test("accepts valid result", () => {
		expect(
			isLoadSkillResult({
				type: "loadSkillResult",
				id: "s1",
				content: "# Skill body",
			}),
		).toBe(true);
	});

	test("rejects missing content", () => {
		expect(isLoadSkillResult({ type: "loadSkillResult", id: "s1" })).toBe(
			false,
		);
	});
});

describe("isLoadSkillError", () => {
	test("accepts valid error", () => {
		expect(
			isLoadSkillError({ type: "loadSkillError", id: "s1", error: "not found" }),
		).toBe(true);
	});

	test("rejects missing error", () => {
		expect(isLoadSkillError({ type: "loadSkillError", id: "s1" })).toBe(false);
	});
});
