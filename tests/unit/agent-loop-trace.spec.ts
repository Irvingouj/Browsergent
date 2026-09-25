import { describe, expect, test } from "vitest";
import {
	computeToolEndTraceStatus,
	contextBudgetForModel,
} from "../../src/worker/agent-loop";

describe("contextBudgetForModel", () => {
	test("reserves model output tokens from the model context window", () => {
		expect(
			contextBudgetForModel({ contextWindow: 128_000, maxTokens: 4_096 }),
		).toBe(123_904);
	});

	test("uses the Rust projection default when the model omits its window", () => {
		expect(contextBudgetForModel({})).toBe(95_904);
	});
});

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
