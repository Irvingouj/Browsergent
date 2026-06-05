import { describe, expect, test } from "vitest";
import { computeToolEndTraceStatus } from "../../src/worker/agent-loop";

describe("computeToolEndTraceStatus", () => {
	test("returns 'error' for error envelope output", () => {
		const envelope =
			'{"_is_error":true,"code":"E_JS_TIMEOUT","message":"timeout","hint":"retry"}';
		expect(computeToolEndTraceStatus("completed", undefined, envelope)).toBe(
			"error",
		);
	});

	test("returns 'done' for normal output", () => {
		expect(
			computeToolEndTraceStatus("completed", undefined, "normal result"),
		).toBe("done");
	});

	test("returns 'error' for SDK status 'failed'", () => {
		expect(
			computeToolEndTraceStatus("failed", { message: "crash" }, null),
		).toBe("error");
	});

	test("returns 'error' for SDK error with normal output", () => {
		expect(
			computeToolEndTraceStatus("failed", { message: "err" }, "some output"),
		).toBe("error");
	});

	test("returns 'done' when status is completed and no error envelope", () => {
		expect(computeToolEndTraceStatus("completed", undefined, "42")).toBe(
			"done",
		);
	});
});
