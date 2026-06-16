import { describe, expect, test } from "vitest";

describe("tool-error-result", () => {
	test("formatToolError produces valid JSON envelope with _is_error: true", async () => {
		const { formatToolError } = await import(
			"../../src/worker/tool-error-result"
		);
		const result = formatToolError(
			"E_JS_TIMEOUT",
			"JS execution timed out after 30000ms",
			"Retry the same code",
		);
		const parsed = JSON.parse(result);
		expect(parsed._is_error).toBe(true);
		expect(parsed.code).toBe("E_JS_TIMEOUT");
		expect(parsed.message).toBe("JS execution timed out after 30000ms");
		expect(parsed.hint).toBe("Retry the same code");
	});

	test("parseToolErrorEnvelope extracts fields from valid envelope", async () => {
		const { formatToolError, parseToolErrorEnvelope } = await import(
			"../../src/worker/tool-error-result"
		);
		const envelope = formatToolError(
			"E_JS_RUNTIME",
			"runtime error",
			"Fix and retry",
		);
		const parsed = parseToolErrorEnvelope(envelope);
		expect(parsed).toEqual({
			_is_error: true,
			code: "E_JS_RUNTIME",
			message: "runtime error",
			hint: "Fix and retry",
		});
	});

	test("parseToolErrorEnvelope returns null for non-error content", async () => {
		const { parseToolErrorEnvelope } = await import(
			"../../src/worker/tool-error-result"
		);
		expect(parseToolErrorEnvelope("normal tool output")).toBeNull();
		expect(
			parseToolErrorEnvelope("[compile error] line 5: syntax error"),
		).toBeNull();
		expect(parseToolErrorEnvelope("")).toBeNull();
		expect(parseToolErrorEnvelope('{"code":123}')).toBeNull();
	});

	test("isToolErrorEnvelope detects error envelopes", async () => {
		const { formatToolError, isToolErrorEnvelope } = await import(
			"../../src/worker/tool-error-result"
		);
		const envelope = formatToolError("E_JS_RUNTIME", "err", "hint");
		expect(isToolErrorEnvelope(envelope)).toBe(true);
		expect(isToolErrorEnvelope("normal text")).toBe(false);
		expect(isToolErrorEnvelope("")).toBe(false);
	});

	test("renderToolOutput formats human-readable from envelope", async () => {
		const { formatToolError, renderToolOutput } = await import(
			"../../src/worker/tool-error-result"
		);
		const envelope = formatToolError("E_JS_TIMEOUT", "timeout error", "retry");
		const text = renderToolOutput(envelope);
		expect(text).toBe("[E_JS_TIMEOUT] timeout error\nRecovery: retry");
	});

	test("renderToolOutput passes through non-envelope text unchanged", async () => {
		const { renderToolOutput } = await import(
			"../../src/worker/tool-error-result"
		);
		expect(renderToolOutput("normal output")).toBe("normal output");
		expect(renderToolOutput("")).toBe("");
	});

	test("formatToolError omits stack when not provided or whitespace-only", async () => {
		const { formatToolError, parseToolErrorEnvelope } = await import(
			"../../src/worker/tool-error-result"
		);
		const noStack = formatToolError("E_JS_RUNTIME", "err", "hint");
		expect(parseToolErrorEnvelope(noStack)?.stack).toBeUndefined();

		const blankStack = formatToolError("E_JS_RUNTIME", "err", "hint", "   ");
		expect(parseToolErrorEnvelope(blankStack)?.stack).toBeUndefined();
	});

	test("formatToolError + parseToolErrorEnvelope round-trip stack", async () => {
		const { formatToolError, parseToolErrorEnvelope } = await import(
			"../../src/worker/tool-error-result"
		);
		const frames =
			"Error: foo\n    at baz (file.js:1:7)\n    at qux (file.js:2:5)";
		const env = formatToolError("E_JS_RUNTIME", "err", "hint", frames);
		const parsed = parseToolErrorEnvelope(env);
		expect(parsed?.stack).toBe(frames);
	});

	test("renderToolOutput includes Stack section when envelope has stack", async () => {
		const { formatToolError, renderToolOutput } = await import(
			"../../src/worker/tool-error-result"
		);
		const frames = "Error: foo\n    at baz (file.js:1:7)";
		const text = renderToolOutput(
			formatToolError("E_JS_TIMEOUT", "timeout error", "retry", frames),
		);
		expect(text).toBe(
			`[E_JS_TIMEOUT] timeout error\nRecovery: retry\nStack:\n${frames}`,
		);
	});

	test("isStackUseful rejects QuickJS wasm32 garbage stacks", async () => {
		const { isStackUseful } = await import(
			"../../src/worker/tool-error-result"
		);
		// Real QuickJS wasm32 backtrace barrier yields ~5 garbage bytes.
		// The exact bytes are engine-dependent; what matters is no useful frame.
		expect(isStackUseful(")\n")).toBe(false);
		expect(isStackUseful("")).toBe(false);
		expect(isStackUseful("   ")).toBe(false);
		expect(isStackUseful(undefined)).toBe(false);
		expect(isStackUseful(null)).toBe(false);
	});

	test("isStackUseful accepts stacks containing frame info", async () => {
		const { isStackUseful } = await import(
			"../../src/worker/tool-error-result"
		);
		expect(isStackUseful("Error: foo\n    at baz (file.js:1:7)")).toBe(true);
		expect(isStackUseful("at qux (eval:3:11)")).toBe(true);
		expect(isStackUseful("foo.js:10:5")).toBe(true);
	});

	test("formatToolError strips garbage stack from envelope", async () => {
		const { formatToolError, parseToolErrorEnvelope } = await import(
			"../../src/worker/tool-error-result"
		);
		// Pre-fix: garbage stack would be attached and the UI would render
		// control chars in a Stack section. Post-fix: stack is dropped.
		const env = formatToolError(
			"E_JS_RUNTIME",
			"ReferenceError",
			"retry",
			")\n",
		);
		const parsed = parseToolErrorEnvelope(env);
		expect(parsed?.stack).toBeUndefined();
	});
});
