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
	isValidFileOp,
	isValidFileOpResult,
} from "../../src/protocol/worker-guards";
import type { FileOp, FileOpResult } from "../../src/worker/file-op-relay";

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

	test("accepts valid write op", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				id: "f1",
				sessionId: "s1",
				op: { op: "write", path: "out.md", content: "hello" },
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

	test("rejects write op missing path", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				id: "f1",
				sessionId: "s1",
				op: { op: "write", content: "hello" },
			}),
		).toBe(false);
	});

	test("rejects write op missing content", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				id: "f1",
				sessionId: "s1",
				op: { op: "write", path: "out.md" },
			}),
		).toBe(false);
	});

	test("rejects write op with non-string content", () => {
		expect(
			isFileOpRequest({
				type: "fileOpRequest",
				id: "f1",
				sessionId: "s1",
				op: { op: "write", path: "out.md", content: 42 },
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

	test("accepts valid write result", () => {
		expect(
			isFileOpResult({
				type: "fileOpResult",
				id: "f1",
				result: { op: "write", bytes: 5 },
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

	test("rejects write result missing bytes", () => {
		expect(
			isFileOpResult({
				type: "fileOpResult",
				id: "f1",
				result: { op: "write" },
			}),
		).toBe(false);
	});

	test("rejects write result with non-number bytes", () => {
		expect(
			isFileOpResult({
				type: "fileOpResult",
				id: "f1",
				result: { op: "write", bytes: "five" },
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

describe("isValidFileOp — direct variant coverage", () => {
	test("rejects non-object input", () => {
		expect(isValidFileOp("list")).toBe(false);
		expect(isValidFileOp(42)).toBe(false);
		expect(isValidFileOp(null)).toBe(false);
		expect(isValidFileOp(undefined)).toBe(false);
	});

	test("rejects missing op discriminant", () => {
		expect(isValidFileOp({})).toBe(false);
	});

	test("rejects unknown op discriminant", () => {
		expect(isValidFileOp({ op: "bogus" })).toBe(false);
		expect(isValidFileOp({ op: "LIST" })).toBe(false);
		expect(isValidFileOp({ op: "" })).toBe(false);
	});

	test("list: accepts without prefix", () => {
		expect(isValidFileOp({ op: "list" })).toBe(true);
	});

	test("list: accepts with string prefix", () => {
		expect(isValidFileOp({ op: "list", prefix: "notes" })).toBe(true);
	});

	test("list: rejects with non-string prefix", () => {
		expect(isValidFileOp({ op: "list", prefix: 42 })).toBe(false);
		expect(isValidFileOp({ op: "list", prefix: null })).toBe(false);
	});

	test("read: accepts with path", () => {
		expect(isValidFileOp({ op: "read", path: "x.md" })).toBe(true);
	});

	test("read: rejects missing path", () => {
		expect(isValidFileOp({ op: "read" })).toBe(false);
	});

	test("read: rejects non-string path", () => {
		expect(isValidFileOp({ op: "read", path: 42 })).toBe(false);
	});

	test("write: accepts with path and content", () => {
		expect(isValidFileOp({ op: "write", path: "out.md", content: "hi" })).toBe(
			true,
		);
	});

	test("write: rejects missing path", () => {
		expect(isValidFileOp({ op: "write", content: "hi" })).toBe(false);
	});

	test("write: rejects missing content", () => {
		expect(isValidFileOp({ op: "write", path: "out.md" })).toBe(false);
	});

	test("write: rejects non-string content", () => {
		expect(isValidFileOp({ op: "write", path: "out.md", content: 42 })).toBe(
			false,
		);
	});

	test("edit: accepts with required fields", () => {
		expect(
			isValidFileOp({
				op: "edit",
				path: "x.md",
				oldString: "a",
				newString: "b",
			}),
		).toBe(true);
	});

	test("edit: accepts with optional replaceAll", () => {
		expect(
			isValidFileOp({
				op: "edit",
				path: "x.md",
				oldString: "a",
				newString: "b",
				replaceAll: true,
			}),
		).toBe(true);
	});

	test("edit: rejects missing oldString", () => {
		expect(
			isValidFileOp({ op: "edit", path: "x.md", newString: "b" }),
		).toBe(false);
	});

	test("edit: rejects missing newString", () => {
		expect(
			isValidFileOp({ op: "edit", path: "x.md", oldString: "a" }),
		).toBe(false);
	});

	test("edit: rejects non-boolean replaceAll", () => {
		expect(
			isValidFileOp({
				op: "edit",
				path: "x.md",
				oldString: "a",
				newString: "b",
				replaceAll: "yes",
			}),
		).toBe(false);
	});

	test("delete: accepts with path", () => {
		expect(isValidFileOp({ op: "delete", path: "x.md" })).toBe(true);
	});

	test("delete: rejects missing path", () => {
		expect(isValidFileOp({ op: "delete" })).toBe(false);
	});
});

describe("isValidFileOpResult — direct variant coverage", () => {
	test("rejects non-object input", () => {
		expect(isValidFileOpResult("list")).toBe(false);
		expect(isValidFileOpResult(42)).toBe(false);
		expect(isValidFileOpResult(null)).toBe(false);
		expect(isValidFileOpResult(undefined)).toBe(false);
	});

	test("rejects missing op discriminant", () => {
		expect(isValidFileOpResult({})).toBe(false);
	});

	test("rejects unknown op discriminant", () => {
		expect(isValidFileOpResult({ op: "bogus" })).toBe(false);
	});

	test("list: accepts with files array", () => {
		expect(isValidFileOpResult({ op: "list", files: [] })).toBe(true);
	});

	test("list: rejects without files array", () => {
		expect(isValidFileOpResult({ op: "list" })).toBe(false);
		expect(isValidFileOpResult({ op: "list", files: "nope" })).toBe(false);
	});

	test("read: accepts with content/bytes/truncated", () => {
		expect(
			isValidFileOpResult({
				op: "read",
				content: "x",
				bytes: 1,
				truncated: false,
			}),
		).toBe(true);
	});

	test("read: rejects missing any required field", () => {
		expect(
			isValidFileOpResult({ op: "read", bytes: 1, truncated: false }),
		).toBe(false);
		expect(
			isValidFileOpResult({ op: "read", content: "x", truncated: false }),
		).toBe(false);
		expect(
			isValidFileOpResult({ op: "read", content: "x", bytes: 1 }),
		).toBe(false);
	});

	test("write: accepts with bytes", () => {
		expect(isValidFileOpResult({ op: "write", bytes: 5 })).toBe(true);
	});

	test("write: rejects missing bytes", () => {
		expect(isValidFileOpResult({ op: "write" })).toBe(false);
	});

	test("write: rejects non-number bytes", () => {
		expect(isValidFileOpResult({ op: "write", bytes: "five" })).toBe(false);
	});

	test("edit: accepts with occurrences and bytes", () => {
		expect(
			isValidFileOpResult({ op: "edit", occurrences: 1, bytes: 10 }),
		).toBe(true);
	});

	test("edit: rejects missing either field", () => {
		expect(isValidFileOpResult({ op: "edit", bytes: 10 })).toBe(false);
		expect(isValidFileOpResult({ op: "edit", occurrences: 1 })).toBe(false);
	});

	test("delete: accepts with no extra fields", () => {
		expect(isValidFileOpResult({ op: "delete" })).toBe(true);
	});
});

describe("isValidFileOp — drift detector", () => {
	const VALID_OP_BUILDERS: Record<FileOp["op"], () => FileOp> = {
		list: () => ({ op: "list" }),
		read: () => ({ op: "read", path: "x" }),
		write: () => ({ op: "write", path: "x", content: "y" }),
		edit: () => ({
			op: "edit",
			path: "x",
			oldString: "a",
			newString: "b",
		}),
		delete: () => ({ op: "delete", path: "x" }),
	};

	test("every FileOp variant has a valid builder that the guard accepts", () => {
		const tags = Object.keys(VALID_OP_BUILDERS) as FileOp["op"][];
		expect(tags.sort()).toEqual(
			(["delete", "edit", "list", "read", "write"] as FileOp["op"][]).sort(),
		);
		for (const build of Object.values(VALID_OP_BUILDERS)) {
			expect(isValidFileOp(build())).toBe(true);
		}
	});
});

describe("isValidFileOpResult — drift detector", () => {
	const VALID_RESULT_BUILDERS: Record<FileOpResult["op"], () => FileOpResult> = {
		list: () => ({ op: "list", files: [] }),
		read: () => ({ op: "read", content: "x", bytes: 1, truncated: false }),
		write: () => ({ op: "write", bytes: 5 }),
		edit: () => ({ op: "edit", occurrences: 1, bytes: 10 }),
		delete: () => ({ op: "delete" }),
	};

	test("every FileOpResult variant has a valid builder that the guard accepts", () => {
		const tags = Object.keys(VALID_RESULT_BUILDERS) as FileOpResult["op"][];
		expect(tags.sort()).toEqual(
			(["delete", "edit", "list", "read", "write"] as FileOpResult["op"][]).sort(),
		);
		for (const build of Object.values(VALID_RESULT_BUILDERS)) {
			expect(isValidFileOpResult(build())).toBe(true);
		}
	});
});
