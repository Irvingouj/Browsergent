import { describe, expect, test, vi } from "vitest";

vi.mock("zustand/react", () => ({ useStore: () => undefined }));
vi.mock("preact/hooks", () => ({
	useEffect: () => {},
	useRef: () => ({ current: new Set() }),
}));

import { classifyTitleResponse } from "../../src/sidepanel/components/use-title-generation";

describe("classifyTitleResponse", () => {
	test("401 → E_PROVIDER_AUTH with status in details", () => {
		const e = classifyTitleResponse(401, "unauthorized");
		expect(e.code).toBe("E_PROVIDER_AUTH");
		expect(e.source).toBe("settings");
		expect(e.details?.status).toBe(401);
		expect(e.details?.upstream).toBe("unauthorized");
	});

	test("403 → E_PROVIDER_AUTH", () => {
		const e = classifyTitleResponse(403, "forbidden");
		expect(e.code).toBe("E_PROVIDER_AUTH");
		expect(e.details?.status).toBe(403);
	});

	test("404 → E_PROVIDER_NOT_FOUND", () => {
		const e = classifyTitleResponse(404, "model not found");
		expect(e.code).toBe("E_PROVIDER_NOT_FOUND");
		expect(e.details?.status).toBe(404);
	});

	test("500 → E_NETWORK (transient server error)", () => {
		const e = classifyTitleResponse(500, "internal error");
		expect(e.code).toBe("E_NETWORK");
		expect(e.details?.status).toBe(500);
	});

	test("429 → E_NETWORK (rate limit, retryable by caller)", () => {
		const e = classifyTitleResponse(429, "");
		expect(e.code).toBe("E_NETWORK");
		expect(e.details?.status).toBe(429);
	});

	test("upstream body is truncated to 500 chars", () => {
		const long = "x".repeat(800);
		const e = classifyTitleResponse(500, long);
		expect((e.details?.upstream as string).length).toBe(500);
	});

	test("message includes the status code", () => {
		const e = classifyTitleResponse(503, "");
		expect(e.message).toContain("503");
	});
});
