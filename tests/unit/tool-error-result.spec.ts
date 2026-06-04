import { describe, expect, test } from "vitest";

describe("tool-error-result", () => {
	test("formatToolError produces valid JSON envelope with _is_error: true", async () => {
		const { formatToolError } = await import(
			"../../src/worker/tool-error-result"
		);
		const result = formatToolError(
			"E_LUA_TIMEOUT",
			"JS execution timed out after 30000ms",
			"Retry the same code",
		);
		const parsed = JSON.parse(result);
		expect(parsed._is_error).toBe(true);
		expect(parsed.code).toBe("E_LUA_TIMEOUT");
		expect(parsed.message).toBe("JS execution timed out after 30000ms");
		expect(parsed.hint).toBe("Retry the same code");
	});

	test("parseToolErrorEnvelope extracts fields from valid envelope", async () => {
		const { formatToolError, parseToolErrorEnvelope } = await import(
			"../../src/worker/tool-error-result"
		);
		const envelope = formatToolError(
			"E_LUA_RUNTIME",
			"runtime error",
			"Fix and retry",
		);
		const parsed = parseToolErrorEnvelope(envelope);
		expect(parsed).toEqual({
			_is_error: true,
			code: "E_LUA_RUNTIME",
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
		const envelope = formatToolError("E_LUA_RUNTIME", "err", "hint");
		expect(isToolErrorEnvelope(envelope)).toBe(true);
		expect(isToolErrorEnvelope("normal text")).toBe(false);
		expect(isToolErrorEnvelope("")).toBe(false);
	});

	test("renderToolOutput formats human-readable from envelope", async () => {
		const { formatToolError, renderToolOutput } = await import(
			"../../src/worker/tool-error-result"
		);
		const envelope = formatToolError("E_LUA_TIMEOUT", "timeout error", "retry");
		const text = renderToolOutput(envelope);
		expect(text).toBe("[E_LUA_TIMEOUT] timeout error\nRecovery: retry");
	});

	test("renderToolOutput passes through non-envelope text unchanged", async () => {
		const { renderToolOutput } = await import(
			"../../src/worker/tool-error-result"
		);
		expect(renderToolOutput("normal output")).toBe("normal output");
		expect(renderToolOutput("")).toBe("");
	});
});
