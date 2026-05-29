/**
 * Unit tests for src/types/lua-utils.ts utilities.
 */

import { describe, expect, test } from "vitest";
import type { LuaRunResult } from "@pi-oxide/extension-lua";
import { formatCellResult, formatError } from "../src/types/lua-utils";

type WasmCellError = Extract<LuaRunResult, { status: "err" }>["error"];

describe("formatCellResult", () => {
	test("formats stdout-only result", () => {
		const cell: LuaRunResult = {
			status: "ok",
			stdout: [
				{ type: "stdout", line: "hello" },
				{ type: "auto", line: "world" },
			],
			stderr: [],
			result: null,
			execution_count: 1,
		};
		expect(formatCellResult(cell)).toBe("hello\nworld");
	});

	test("formats result value", () => {
		const cell: LuaRunResult = {
			status: "ok",
			stdout: [],
			stderr: [],
			result: "42",
			execution_count: 2,
		};
		expect(formatCellResult(cell)).toBe("42");
	});

	test("combines stdout and result", () => {
		const cell: LuaRunResult = {
			status: "ok",
			stdout: [{ type: "stdout", line: "running..." }],
			stderr: [],
			result: "done",
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
		const cell: LuaRunResult = {
			status: "err",
			stdout: [],
			stderr: [],
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
		const cell: LuaRunResult = {
			status: "err",
			stdout: [],
			stderr: [],
			error,
			execution_count: 5,
		};
		expect(formatCellResult(cell)).toBe("[compile error] syntax error");
	});

	test("formats runtime error with line number", () => {
		const error: WasmCellError = {
			kind: "runtime",
			message: "attempt to call nil value",
			line: 12,
		};
		const cell: LuaRunResult = {
			status: "err",
			stdout: [],
			stderr: [],
			error,
			execution_count: 6,
		};
		expect(formatCellResult(cell)).toBe(
			"[runtime error] line 12: attempt to call nil value",
		);
	});

	test("formats runtime error without line number", () => {
		const error: WasmCellError = {
			kind: "runtime",
			message: "something went wrong",
			line: null,
		};
		const cell: LuaRunResult = {
			status: "err",
			stdout: [],
			stderr: [],
			error,
			execution_count: 6,
		};
		expect(formatCellResult(cell)).toBe(
			"[runtime error] something went wrong",
		);
	});

	test("formats strict_mode error", () => {
		const error: WasmCellError = {
			kind: "strict_mode",
			variable: "undefined_var",
		};
		const cell: LuaRunResult = {
			status: "err",
			stdout: [],
			stderr: [],
			error,
			execution_count: 7,
		};
		expect(formatCellResult(cell)).toBe(
			"[strict mode] undefined variable: undefined_var",
		);
	});

	test("formats fuel_exhausted error", () => {
		const error: WasmCellError = { kind: "fuel_exhausted" };
		const cell: LuaRunResult = {
			status: "err",
			stdout: [],
			stderr: [],
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
		const cell: LuaRunResult = {
			status: "err",
			stdout: [],
			stderr: [],
			error,
			execution_count: 9,
		};
		expect(formatCellResult(cell)).toBe("[internal error] WASM trap");
	});

	test("includes stderr in error output", () => {
		const error: WasmCellError = {
			kind: "runtime",
			message: "something went wrong",
			line: null,
		};
		const cell: LuaRunResult = {
			status: "err",
			stdout: [],
			stderr: ["debug trace line 1", "debug trace line 2"],
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
				error: { kind: "runtime", message: "oops", line: 3 },
				expected: "[runtime error] line 3: oops",
			},
			{
				error: { kind: "runtime", message: "oops", line: null },
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
