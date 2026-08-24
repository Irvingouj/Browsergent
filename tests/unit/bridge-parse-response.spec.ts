import { describe, expect, test } from "vitest";
import { parseBridgeResponse } from "../../src/protocol/bridge";

describe("parseBridgeResponse", () => {
	test("rejects a success frame that is not a known bridge result", () => {
		const parsed = parseBridgeResponse(
			{ id: "req-1", ok: true, method: "run_js", result: { sneaky: true } },
			"req-1",
		);
		expect(parsed).toEqual({
			id: "req-1",
			ok: false,
			error: {
				code: "E_PROTOCOL",
				message: "Invalid bridge response",
			},
		});
	});

	test("accepts a typed run_js success string", () => {
		const parsed = parseBridgeResponse(
			{ id: "req-2", ok: true, method: "run_js", result: "2" },
			"req-2",
		);
		expect(parsed).toEqual({
			id: "req-2",
			ok: true,
			method: "run_js",
			result: "2",
		});
	});
});
