import { describe, expect, test } from "vitest";
import type { CellResult } from "../../src/types/extjs-utils";

describe("formatJsRunResult", () => {
	test("renders ok cell with stdout and result", async () => {
		const { formatJsRunResult } = await import("../../src/types/extjs-utils");
		const cell: CellResult = {
			status: "ok",
			stdout: ["hello"],
			stderr: [],
			result: "ok-value",
			execution_count: 1,
		};
		expect(formatJsRunResult(cell)).toBe("hello\nok-value");
	});

	test("renders err cell using formatError", async () => {
		const { formatJsRunResult } = await import("../../src/types/extjs-utils");
		const cell: CellResult = {
			status: "err",
			stdout: [],
			stderr: ["note"],
			error: {
				kind: "compile",
				name: null,
				message: "syntax boom",
				line: 7,
				stack: null,
			},
			execution_count: 1,
		};
		expect(formatJsRunResult(cell)).toBe(
			"[compile error] line 7: syntax boom\nnote",
		);
	});
});

describe("formatError runtime branch", () => {
	test("uses error.message when present", async () => {
		const { formatError } = await import("../../src/types/extjs-utils");
		const out = formatError({
			kind: "runtime",
			name: "TypeError",
			message: "Cannot read 'x'",
			line: null,
			action: null,
			code: null,
			stack: null,
		});
		expect(out).toBe("[runtime error] TypeError: Cannot read 'x'");
	});

	test("falls back to stack when message empty (action/code path)", async () => {
		const { formatError } = await import("../../src/types/extjs-utils");
		const out = formatError({
			kind: "runtime",
			name: null,
			message: "",
			line: null,
			action: "page.click",
			code: null,
			stack: "TypeError: at foo (file.js:1:7)\n    at bar (file.js:2:5)",
		});
		// When action/code present, format_js_exception message is used as-is.
		// Empty message + action present is an inconsistent state, so we only
		// assert that the message text is preserved without truncation.
		expect(out).toContain("TypeError: at foo (file.js:1:7)");
	});

	test("falls back to stack for plain runtime error with empty message", async () => {
		const { formatError } = await import("../../src/types/extjs-utils");
		const out = formatError({
			kind: "runtime",
			name: "TypeError",
			message: "",
			line: 3,
			action: null,
			code: null,
			stack: "TypeError\n    at foo (file.js:1:7)",
		});
		expect(out).toBe(
			"[runtime error] line 3: TypeError: TypeError\n    at foo (file.js:1:7)",
		);
	});

	test("empty message and empty stack yields bare prefix", async () => {
		const { formatError } = await import("../../src/types/extjs-utils");
		const out = formatError({
			kind: "runtime",
			name: null,
			message: "",
			line: null,
			action: null,
			code: null,
			stack: null,
		});
		expect(out).toBe("[runtime error] ");
	});
});
