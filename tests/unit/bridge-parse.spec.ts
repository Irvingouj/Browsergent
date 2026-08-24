import { describe, expect, test } from "vitest";
import { parseBridgeRequest } from "../../src/protocol/bridge";

describe("parseBridgeRequest", () => {
	test("rejects a CLI frame that has no enrollment token", () => {
		const parsed = parseBridgeRequest({
			id: "req-1",
			method: "session.create",
		});
		expect(parsed).toEqual({
			id: "req-1",
			ok: false,
			error: {
				code: "E_PROTOCOL",
				message: "Invalid bridge request",
			},
		});
	});

	test("accepts a CLI frame that carries the enrollment token", () => {
		const parsed = parseBridgeRequest({
			id: "req-2",
			token: "tok-123",
			method: "run_js",
			params: { code: "await page.snapshot()" },
		});
		expect(parsed).toEqual({
			id: "req-2",
			token: "tok-123",
			method: "run_js",
			params: { code: "await page.snapshot()" },
		});
	});

	test("keeps the CLI session id on the wire so the host can persist into that session", () => {
		const parsed = parseBridgeRequest({
			id: "req-3",
			token: "tok-123",
			sessionId: "cli-session-1",
			method: "run_js",
			params: { code: "1 + 1" },
		});
		expect(parsed).toEqual({
			id: "req-3",
			token: "tok-123",
			sessionId: "cli-session-1",
			method: "run_js",
			params: { code: "1 + 1" },
		});
	});
});
