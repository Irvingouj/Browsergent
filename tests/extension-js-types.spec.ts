/**
 * Unit tests for src/types/js-utils.ts utilities.
 */

import { describe, expect, test } from "vitest";
import type { CellResult } from "../src/types/extjs-utils";
import { formatError, formatJsRunResult } from "../src/types/extjs-utils";

type WasmCellError = Extract<CellResult, { status: "err" }>["error"];

describe("formatJsRunResult", () => {
	test("formats stdout-only result", () => {
		const cell: CellResult = {
			status: "ok",
			stdout: ["hello", "world"],
			stderr: [],
			result: null,
			execution_count: 1,
		};
		expect(formatJsRunResult(cell)).toBe("hello\nworld");
	});

	test("formats result value", () => {
		const cell: CellResult = {
			status: "ok",
			stdout: [],
			stderr: [],
			result: "42",
			execution_count: 2,
		};
		expect(formatJsRunResult(cell)).toBe("42");
	});

	test("combines stdout and result", () => {
		const cell: CellResult = {
			status: "ok",
			stdout: ["running..."],
			stderr: [],
			result: "done",
			execution_count: 3,
		};
		expect(formatJsRunResult(cell)).toBe("running...\ndone");
	});

	test("formats compile error with line number", () => {
		const error: WasmCellError = {
			kind: "compile",
			name: null,
			message: "unexpected symbol",
			line: 5,
		};
		const cell: CellResult = {
			status: "err",
			stdout: [],
			stderr: [],
			error,
			execution_count: 4,
		};
		expect(formatJsRunResult(cell)).toBe(
			"[compile error] line 5: unexpected symbol",
		);
	});

	test("formats compile error without line number", () => {
		const error: WasmCellError = {
			kind: "compile",
			name: null,
			message: "syntax error",
			line: null,
		};
		const cell: CellResult = {
			status: "err",
			stdout: [],
			stderr: [],
			error,
			execution_count: 5,
		};
		expect(formatJsRunResult(cell)).toBe("[compile error] syntax error");
	});

	test("formats runtime error with line number", () => {
		const error: WasmCellError = {
			kind: "runtime",
			name: null,
			message: "attempt to call nil value",
			line: 12,
			action: null,
			code: null,
		};
		const cell: CellResult = {
			status: "err",
			stdout: [],
			stderr: [],
			error,
			execution_count: 6,
		};
		expect(formatJsRunResult(cell)).toBe(
			"[runtime error] line 12: attempt to call nil value",
		);
	});

	test("formats runtime error without line number", () => {
		const error: WasmCellError = {
			kind: "runtime",
			name: null,
			message: "something went wrong",
			line: null,
			action: null,
			code: null,
		};
		const cell: CellResult = {
			status: "err",
			stdout: [],
			stderr: [],
			error,
			execution_count: 6,
		};
		expect(formatJsRunResult(cell)).toBe(
			"[runtime error] something went wrong",
		);
	});

	test("formats fuel_exhausted error", () => {
		const error: WasmCellError = { kind: "fuel_exhausted" };
		const cell: CellResult = {
			status: "err",
			stdout: [],
			stderr: [],
			error,
			execution_count: 8,
		};
		expect(formatJsRunResult(cell)).toBe(
			"[execution limit reached] possible infinite loop — try a different approach",
		);
	});

	test("formats internal error", () => {
		const error: WasmCellError = {
			kind: "internal",
			message: "WASM trap",
		};
		const cell: CellResult = {
			status: "err",
			stdout: [],
			stderr: [],
			error,
			execution_count: 9,
		};
		expect(formatJsRunResult(cell)).toBe("[internal error] WASM trap");
	});

	test("includes stderr in error output", () => {
		const error: WasmCellError = {
			kind: "runtime",
			name: null,
			message: "something went wrong",
			line: null,
			action: null,
			code: null,
		};
		const cell: CellResult = {
			status: "err",
			stdout: [],
			stderr: ["debug trace line 1", "debug trace line 2"],
			error,
			execution_count: 10,
		};
		expect(formatJsRunResult(cell)).toBe(
			"[runtime error] something went wrong\ndebug trace line 1\ndebug trace line 2",
		);
	});
});

describe("formatError", () => {
	test("handles all WasmCellError variants", () => {
		const cases: Array<{ error: WasmCellError; expected: string }> = [
			{
				error: { kind: "compile", name: null, message: "err", line: 1 },
				expected: "[compile error] line 1: err",
			},
			{
				error: { kind: "compile", name: null, message: "err", line: null },
				expected: "[compile error] err",
			},
			{
				error: {
					kind: "runtime",
					name: null,
					message: "oops",
					line: 3,
					action: null,
					code: null,
				},
				expected: "[runtime error] line 3: oops",
			},
			{
				error: {
					kind: "runtime",
					name: null,
					message: "oops",
					line: null,
					action: null,
					code: null,
				},
				expected: "[runtime error] oops",
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
