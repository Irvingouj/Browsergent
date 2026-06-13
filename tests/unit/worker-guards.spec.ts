import { describe, expect, test } from "vitest";
import { isStaleRunId } from "../../src/controllers/worker-bridge";
import {
	isAgentDiagnosticEvent,
	isAgentMessageEnd,
	isBrowsergentError,
	isExtjsDocsError,
	isExtjsDocsRequest,
	isExtjsDocsResult,
	isFileOpError,
	isFileOpRequest,
	isFileOpResult,
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

	test("accepts activatedSkills array", () => {
		expect(
			isLoadSkillRequest({
				type: "loadSkillRequest",
				id: "s1",
				skill: "capability-check",
				activatedSkills: ["capability-check"],
			}),
		).toBe(true);
	});

	test("rejects invalid activatedSkills", () => {
		expect(
			isLoadSkillRequest({
				type: "loadSkillRequest",
				id: "s1",
				skill: "x",
				activatedSkills: ["ok", 1],
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

describe("isFileOpRequest", () => {
	test("accepts valid list request", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				id: "f1",
				sessionId: "s1",
				op: { op: "list" },
			}),
		).toBe(true);
	});

	test("accepts valid edit request", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				id: "f1",
				sessionId: "s1",
				op: {
					op: "edit",
					path: "x.md",
					oldString: "a",
					newString: "b",
				},
			}),
		).toBe(true);
	});

	test("rejects missing sessionId", () => {
		expect(
			isFileOpRequest({ type: "fileOpRequest", id: "f1", op: { op: "list" } }),
		).toBe(false);
	});

	test("rejects missing id", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				sessionId: "s1",
				op: { op: "list" },
			}),
		).toBe(false);
	});

	test("accepts valid read op", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				id: "f1",
				sessionId: "s1",
				op: { op: "read", path: "x.md" },
			}),
		).toBe(true);
	});

	test("accepts valid delete op", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				id: "f1",
				sessionId: "s1",
				op: { op: "delete", path: "x.md" },
			}),
		).toBe(true);
	});

	test("accepts valid list op with prefix", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				id: "f1",
				sessionId: "s1",
				op: { op: "list", prefix: "notes" },
			}),
		).toBe(true);
	});

	test("accepts valid edit op with replaceAll", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				id: "f1",
				sessionId: "s1",
				op: { op: "edit", path: "x.md", oldString: "a", newString: "b", replaceAll: true },
			}),
		).toBe(true);
	});

	test("rejects op with wrong discriminant", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				id: "f1",
				sessionId: "s1",
				op: { op: "bogus" },
			}),
		).toBe(false);
	});

	test("rejects list op with non-string prefix", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				id: "f1",
				sessionId: "s1",
				op: { op: "list", prefix: 42 },
			}),
		).toBe(false);
	});

	test("rejects read op missing path", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				id: "f1",
				sessionId: "s1",
				op: { op: "read" },
			}),
		).toBe(false);
	});

	test("rejects edit op missing oldString", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				id: "f1",
				sessionId: "s1",
				op: { op: "edit", path: "x.md", newString: "b" },
			}),
		).toBe(false);
	});

	test("rejects edit op missing newString", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				id: "f1",
				sessionId: "s1",
				op: { op: "edit", path: "x.md", oldString: "a" },
			}),
		).toBe(false);
	});

	test("rejects edit op with non-boolean replaceAll", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				id: "f1",
				sessionId: "s1",
				op: { op: "edit", path: "x.md", oldString: "a", newString: "b", replaceAll: "yes" },
			}),
		).toBe(false);
	});

	test("rejects op that is not an object", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				id: "f1",
				sessionId: "s1",
				op: "list",
			}),
		).toBe(false);
	});
});

describe("isFileOpResult", () => {
	test("accepts valid result", () => {
		expect(
			isFileOpResult({
				type: "fileOpResult",
				id: "f1",
				result: { op: "list", files: [] },
			}),
		).toBe(true);
	});

	test("rejects missing result", () => {
		expect(isFileOpResult({ type: "fileOpResult", id: "f1" })).toBe(false);
	});

	test("accepts valid read result", () => {
		expect(
			isFileOpResult({
				type: "fileOpResult",
				id: "f1",
				result: { op: "read", content: "x", bytes: 1, truncated: false },
			}),
		).toBe(true);
	});

	test("accepts valid edit result", () => {
		expect(
			isFileOpResult({
				type: "fileOpResult",
				id: "f1",
				result: { op: "edit", occurrences: 1, bytes: 10 },
			}),
		).toBe(true);
	});

	test("accepts valid delete result", () => {
		expect(
			isFileOpResult({
				type: "fileOpResult",
				id: "f1",
				result: { op: "delete" },
			}),
		).toBe(true);
	});

	test("rejects result with wrong discriminant", () => {
		expect(
			isFileOpResult({
				type: "fileOpResult",
				id: "f1",
				result: { op: "bogus" },
			}),
		).toBe(false);
	});

	test("rejects list result without files array", () => {
		expect(
			isFileOpResult({
				type: "fileOpResult",
				id: "f1",
				result: { op: "list", files: "notarray" },
			}),
		).toBe(false);
	});

	test("rejects read result missing content", () => {
		expect(
			isFileOpResult({
				type: "fileOpResult",
				id: "f1",
				result: { op: "read", bytes: 1, truncated: false },
			}),
		).toBe(false);
	});

	test("rejects read result missing bytes", () => {
		expect(
			isFileOpResult({
				type: "fileOpResult",
				id: "f1",
				result: { op: "read", content: "x", truncated: false },
			}),
		).toBe(false);
	});

	test("rejects read result missing truncated", () => {
		expect(
			isFileOpResult({
				type: "fileOpResult",
				id: "f1",
				result: { op: "read", content: "x", bytes: 1 },
			}),
		).toBe(false);
	});

	test("rejects edit result missing occurrences", () => {
		expect(
			isFileOpResult({
				type: "fileOpResult",
				id: "f1",
				result: { op: "edit", bytes: 10 },
			}),
		).toBe(false);
	});

	test("rejects edit result missing bytes", () => {
		expect(
			isFileOpResult({
				type: "fileOpResult",
				id: "f1",
				result: { op: "edit", occurrences: 1 },
			}),
		).toBe(false);
	});

	test("rejects result that is not an object", () => {
		expect(
			isFileOpResult({
				type: "fileOpResult",
				id: "f1",
				result: "delete",
			}),
		).toBe(false);
	});
});

describe("isFileOpError", () => {
	test("accepts valid error", () => {
		expect(
			isFileOpError({ type: "fileOpError", id: "f1", error: "not found" }),
		).toBe(true);
	});

	test("rejects missing error", () => {
		expect(isFileOpError({ type: "fileOpError", id: "f1" })).toBe(false);
	});

	test("rejects non-string error", () => {
		expect(
			isFileOpError({ type: "fileOpError", id: "f1", error: 42 }),
		).toBe(false);
	});
});
