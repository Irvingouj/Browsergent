/**
 * Unit tests for src/types/extension-lua.ts utilities.
 * Validates formatting, security scanning, and misuse detection.
 */

import { describe, expect, test } from "vitest";
import type { CellResult, WasmCellError } from "../src/types/extension-lua";
import {
	detectPageSnapshotMisuse,
	formatCellResult,
	formatError,
	scanForUnsafeCode,
} from "../src/types/extension-lua";

describe("formatCellResult", () => {
	test("formats stdout-only result", () => {
		const cell: CellResult = {
			stdout: ["hello", "world"],
			stderr: [],
			result: null,
			error: null,
			execution_count: 1,
		};
		expect(formatCellResult(cell)).toBe("hello\nworld");
	});

	test("formats result value", () => {
		const cell: CellResult = {
			stdout: [],
			stderr: [],
			result: "42",
			error: null,
			execution_count: 2,
		};
		expect(formatCellResult(cell)).toBe("42");
	});

	test("combines stdout and result", () => {
		const cell: CellResult = {
			stdout: ["running..."],
			stderr: [],
			result: "done",
			error: null,
			execution_count: 3,
		};
		expect(formatCellResult(cell)).toBe("running...\ndone");
	});

	test("formats compile error with line number", () => {
		const error: WasmCellError = {
			kind: "compile",
			message: "unexpected symbol",
			line: 5,
		};
		const cell: CellResult = {
			stdout: [],
			stderr: [],
			result: null,
			error,
			execution_count: 4,
		};
		expect(formatCellResult(cell)).toBe(
			"[compile error] line 5: unexpected symbol",
		);
	});

	test("formats compile error without line number", () => {
		const error: WasmCellError = {
			kind: "compile",
			message: "syntax error",
			line: null,
		};
		const cell: CellResult = {
			stdout: [],
			stderr: [],
			result: null,
			error,
			execution_count: 5,
		};
		expect(formatCellResult(cell)).toBe("[compile error] syntax error");
	});

	test("formats runtime error", () => {
		const error: WasmCellError = {
			kind: "runtime",
			message: "attempt to call nil value",
		};
		const cell: CellResult = {
			stdout: [],
			stderr: [],
			result: null,
			error,
			execution_count: 6,
		};
		expect(formatCellResult(cell)).toBe(
			"[runtime error] attempt to call nil value",
		);
	});

	test("formats strict_mode error", () => {
		const error: WasmCellError = {
			kind: "strict_mode",
			variable: "undefined_var",
		};
		const cell: CellResult = {
			stdout: [],
			stderr: [],
			result: null,
			error,
			execution_count: 7,
		};
		expect(formatCellResult(cell)).toBe(
			"[strict mode] undefined variable: undefined_var",
		);
	});

	test("formats fuel_exhausted error", () => {
		const error: WasmCellError = { kind: "fuel_exhausted" };
		const cell: CellResult = {
			stdout: [],
			stderr: [],
			result: null,
			error,
			execution_count: 8,
		};
		expect(formatCellResult(cell)).toBe(
			"[execution limit reached] possible infinite loop — try a different approach",
		);
	});

	test("formats internal error", () => {
		const error: WasmCellError = {
			kind: "internal",
			message: "WASM trap",
		};
		const cell: CellResult = {
			stdout: [],
			stderr: [],
			result: null,
			error,
			execution_count: 9,
		};
		expect(formatCellResult(cell)).toBe("[internal error] WASM trap");
	});

	test("includes stderr in error output", () => {
		const error: WasmCellError = {
			kind: "runtime",
			message: "something went wrong",
		};
		const cell: CellResult = {
			stdout: [],
			stderr: ["debug trace line 1", "debug trace line 2"],
			result: null,
			error,
			execution_count: 10,
		};
		expect(formatCellResult(cell)).toBe(
			"[runtime error] something went wrong\ndebug trace line 1\ndebug trace line 2",
		);
	});
});

describe("formatError", () => {
	test("handles all WasmCellError variants", () => {
		const cases: Array<{ error: WasmCellError; expected: string }> = [
			{
				error: { kind: "compile", message: "err", line: 1 },
				expected: "[compile error] line 1: err",
			},
			{
				error: { kind: "compile", message: "err", line: null },
				expected: "[compile error] err",
			},
			{
				error: { kind: "runtime", message: "oops" },
				expected: "[runtime error] oops",
			},
			{
				error: { kind: "strict_mode", variable: "x" },
				expected: "[strict mode] undefined variable: x",
			},
			{
				error: { kind: "fuel_exhausted" },
				expected:
					"[execution limit reached] possible infinite loop — try a different approach",
			},
			{
				error: { kind: "internal", message: "fatal" },
				expected: "[internal error] fatal",
			},
		];

		for (const { error, expected } of cases) {
			expect(formatError(error)).toBe(expected);
		}
	});
});

describe("scanForUnsafeCode", () => {
	test("allows safe tab.* code", () => {
		expect(
			scanForUnsafeCode(
				"local id = tab.current()\nlocal snap = tab.snapshot(id)\nprint(snap)",
			),
		).toBeNull();
	});

	test("blocks tab.evaluate", () => {
		const result = scanForUnsafeCode('tab.evaluate("document.cookie")');
		expect(result).toContain("tab.evaluate");
		expect(result).toContain("forbidden");
	});

	test("blocks tab.execute_script", () => {
		const result = scanForUnsafeCode('tab.execute_script(id, "alert(1)")');
		expect(result).toContain("tab.execute_script");
		expect(result).toContain("forbidden");
	});

	test("blocks chrome.scripting.executeScript", () => {
		const result = scanForUnsafeCode(
			'chrome.scripting.executeScript({code: "fetch(\\"https://evil.com\\")"})',
		);
		expect(result).toContain("chrome.scripting.executeScript");
		expect(result).toContain("forbidden");
	});

	test("allows code with no forbidden patterns", () => {
		expect(scanForUnsafeCode('print("hello")')).toBeNull();
		expect(scanForUnsafeCode("local x = 1 + 2")).toBeNull();
		expect(
			scanForUnsafeCode('tab.fill(id, "e0", "test@example.com")'),
		).toBeNull();
	});

	test("blocks bracket access on tab table", () => {
		const result = scanForUnsafeCode('tab["something"](code)');
		expect(result).toContain("Bracket");
		expect(result).toContain("bypass");
	});
});

describe("detectPageSnapshotMisuse", () => {
	test("warns when page.snapshot used alone", () => {
		const result = detectPageSnapshotMisuse("page.snapshot()");
		expect(result).toContain("page.snapshot captures the extension side panel");
		expect(result).toContain("tab.snapshot");
	});

	test("no warning when tab.snapshot is also present", () => {
		const result = detectPageSnapshotMisuse(
			"page.snapshot()\ntab.snapshot(id)",
		);
		expect(result).toBeNull();
	});

	test("no warning when only tab.snapshot is used", () => {
		expect(detectPageSnapshotMisuse("tab.snapshot(id)")).toBeNull();
	});

	test("no warning for unrelated code", () => {
		expect(detectPageSnapshotMisuse("print('hello')")).toBeNull();
	});
});
