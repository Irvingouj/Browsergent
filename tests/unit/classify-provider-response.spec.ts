import { describe, expect, test } from "vitest";
import { classifyProviderResponse } from "../../src/errors/classify-provider-response";

describe("classifyProviderResponse", () => {
	test("401 → E_PROVIDER_AUTH with status in details", () => {
		const e = classifyProviderResponse(401, "unauthorized");
		expect(e.code).toBe("E_PROVIDER_AUTH");
		expect(e.source).toBe("settings");
		expect(e.details?.status).toBe(401);
		expect(e.details?.upstream).toBe("unauthorized");
	});

	test("403 → E_PROVIDER_AUTH", () => {
		const e = classifyProviderResponse(403, "forbidden");
		expect(e.code).toBe("E_PROVIDER_AUTH");
		expect(e.details?.status).toBe(403);
	});

	test("404 → E_PROVIDER_NOT_FOUND", () => {
		const e = classifyProviderResponse(404, "model not found");
		expect(e.code).toBe("E_PROVIDER_NOT_FOUND");
		expect(e.details?.status).toBe(404);
	});

	test("500 → E_NETWORK (transient server error)", () => {
		const e = classifyProviderResponse(500, "internal error");
		expect(e.code).toBe("E_NETWORK");
		expect(e.details?.status).toBe(500);
	});

	test("429 → E_NETWORK (rate limit)", () => {
		const e = classifyProviderResponse(429, "");
		expect(e.code).toBe("E_NETWORK");
		expect(e.details?.status).toBe(429);
	});

	test("upstream body is truncated to 500 chars", () => {
		const long = "x".repeat(800);
		const e = classifyProviderResponse(500, long);
		expect((e.details?.upstream as string).length).toBe(500);
	});

	test("default label appears in the message", () => {
		const e = classifyProviderResponse(503, "");
		expect(e.message).toContain("503");
		expect(e.message).toContain("Provider");
	});

	test("custom label appears in the message", () => {
		const e = classifyProviderResponse(503, "", "Title");
		expect(e.message).toContain("Title");
	});
});
