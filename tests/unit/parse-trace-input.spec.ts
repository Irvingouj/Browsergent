import { describe, expect, test } from "vitest";
import { parseTraceInput } from "../../src/utils/parse-trace-input";

describe("parseTraceInput", () => {
	test("run_js with valid JSON code", () => {
		const result = parseTraceInput("run_js", '{"code":"page.snapshot()"}');
		expect(result.kind).toBe("js");
		expect(result.text).toBe("page.snapshot()");
		expect(result.preview).toBe("page.snapshot()");
	});

	test("run_js with invalid JSON falls back to raw", () => {
		const result = parseTraceInput("run_js", "not json");
		expect(result.kind).toBe("raw");
		expect(result.text).toBe("not json");
		expect(result.preview).toBe("not json");
	});

	test("run_js with JSON but missing code key falls back to raw", () => {
		const result = parseTraceInput("run_js", '{"foo":"bar"}');
		expect(result.kind).toBe("raw");
		expect(result.text).toBe('{"foo":"bar"}');
	});

	test("run_js with JSON but non-string code falls back to raw", () => {
		const result = parseTraceInput("run_js", '{"code":123}');
		expect(result.kind).toBe("raw");
		expect(result.text).toBe('{"code":123}');
	});

	test("run_js with undefined toolInput falls back to raw", () => {
		const result = parseTraceInput("run_js", undefined);
		expect(result.kind).toBe("raw");
		expect(result.text).toBe("");
		expect(result.preview).toBe("");
	});

	test("run_js with empty string toolInput falls back to raw", () => {
		const result = parseTraceInput("run_js", "");
		expect(result.kind).toBe("raw");
		expect(result.text).toBe("");
		expect(result.preview).toBe("");
	});

	test("non-js tool is always raw", () => {
		const result = parseTraceInput("get_doc", "page docs");
		expect(result.kind).toBe("raw");
		expect(result.text).toBe("page docs");
		expect(result.preview).toBe("page docs");
	});

	test("raw preview truncates to 60 chars", () => {
		const long = "x".repeat(100);
		const result = parseTraceInput("get_doc", long);
		expect(result.preview).toBe(long.slice(0, 60));
	});

	test("js preview skips leading comments and blank lines", () => {
		const code = "// setup\n\npage.snapshot()";
		const result = parseTraceInput("run_js", JSON.stringify({ code }));
		expect(result.preview).toBe("page.snapshot()");
	});

	test("js preview truncates long first line", () => {
		const code = "x".repeat(80);
		const result = parseTraceInput("run_js", JSON.stringify({ code }));
		expect(result.preview).toBe(`${"x".repeat(60)}…`);
	});

	test("js preview returns (empty) for comment-only code", () => {
		const code = "// comment\n// another";
		const result = parseTraceInput("run_js", JSON.stringify({ code }));
		expect(result.preview).toBe("(empty)");
	});

	test("run_js with empty string code", () => {
		const result = parseTraceInput("run_js", '{"code":""}');
		expect(result.kind).toBe("js");
		expect(result.text).toBe("");
		expect(result.preview).toBe("(empty)");
	});

	test("js preview skips multi-line block comments", () => {
		const code = "/* setup\ncomment\n*/\npage.snapshot()";
		const result = parseTraceInput("run_js", JSON.stringify({ code }));
		expect(result.preview).toBe("page.snapshot()");
	});

	test("js preview skips same-line block comment", () => {
		const code = "/* comment */ page.snapshot()";
		const result = parseTraceInput("run_js", JSON.stringify({ code }));
		expect(result.preview).toBe("page.snapshot()");
	});

	test("js preview uses code after block comment end on same line", () => {
		const code = "/* start\nend */ const x = 1;";
		const result = parseTraceInput("run_js", JSON.stringify({ code }));
		expect(result.preview).toBe("const x = 1;");
	});
});
