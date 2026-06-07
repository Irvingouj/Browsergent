import { describe, expect, test } from "vitest";

describe("normalizeJsError", () => {
	test("maps Error instance to E_JS_RUNTIME", async () => {
		const { normalizeJsError } = await import(
			"../../src/errors/normalize-error"
		);
		const err = new Error("something broke");
		const result = normalizeJsError(err);
		expect(result.code).toBe("E_JS_RUNTIME");
		expect(result.message).toBe("something broke");
		expect(result.source).toBe("js");
	});

	test("maps string error to E_JS_RUNTIME", async () => {
		const { normalizeJsError } = await import(
			"../../src/errors/normalize-error"
		);
		const result = normalizeJsError("plain string error");
		expect(result.code).toBe("E_JS_RUNTIME");
		expect(result.message).toBe("plain string error");
		expect(result.source).toBe("js");
	});

	test("maps number error to E_JS_RUNTIME", async () => {
		const { normalizeJsError } = await import(
			"../../src/errors/normalize-error"
		);
		const result = normalizeJsError(42);
		expect(result.code).toBe("E_JS_RUNTIME");
		expect(result.message).toBe("42");
		expect(result.source).toBe("js");
	});

	test("maps null error to E_JS_RUNTIME", async () => {
		const { normalizeJsError } = await import(
			"../../src/errors/normalize-error"
		);
		const result = normalizeJsError(null);
		expect(result.code).toBe("E_JS_RUNTIME");
		expect(result.message).toBe("null");
		expect(result.source).toBe("js");
	});
});
