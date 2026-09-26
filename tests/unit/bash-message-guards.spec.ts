import { describe, expect, test } from "vitest";
import { BashErrorCode } from "../../src/bash/types";
import {
	isBashError,
	isBashRequest,
	isBashResult,
} from "../../src/protocol/worker-guards";

describe("bash message guards", () => {
	test("accepts a bash request and a coded failure", () => {
		expect(
			isBashRequest({
				type: "bashRequest",
				id: "bash-1",
				sessionId: "s1",
				command: "pwd",
			}),
		).toBe(true);
		expect(
			isBashError({
				type: "bashError",
				id: "bash-1",
				code: BashErrorCode.Failed,
				error: "disk failed",
			}),
		).toBe(true);
	});

	test("rejects a result whose transcript is missing", () => {
		expect(
			isBashResult({
				type: "bashResult",
				id: "bash-1",
				result: { stdout: "ok" },
			}),
		).toBe(false);
		expect(
			isBashError({
				type: "bashError",
				id: "bash-1",
				error: "disk failed",
			}),
		).toBe(false);
	});
});
