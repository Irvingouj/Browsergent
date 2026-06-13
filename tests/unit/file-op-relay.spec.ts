import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FileOpRelay } from "../../src/worker/file-op-relay";
import type { FileOpRelayRequest } from "../../src/worker/file-op-relay";

describe("FileOpRelay", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("posts fileOpRequest when relay starts", async () => {
		const posted: FileOpRelayRequest[] = [];
		const relay = new FileOpRelay((request) => {
			posted.push(request);
		}, 30_000);

		const promise = relay.relay("s1", { op: "list" });
		expect(posted).toHaveLength(1);
		expect(posted[0]?.sessionId).toBe("s1");
		expect(posted[0]?.op).toEqual({ op: "list" });
		expect(posted[0]?.id).toMatch(/^file-op-/);

		relay.resolve(posted[0]?.id ?? "", { op: "list", files: [] });
		await expect(promise).resolves.toEqual({ op: "list", files: [] });
	});

	test("rejects when relay times out", async () => {
		const relay = new FileOpRelay(() => {}, 1_000);
		const promise = relay.relay("s1", { op: "read", path: "x.md" });

		vi.advanceTimersByTime(1_000);
		await expect(promise).rejects.toThrow(
			"File op relay timed out after 1000ms",
		);
	});

	test("resolve clears pending and prevents timeout rejection", async () => {
		const relay = new FileOpRelay((request) => {
			relay.resolve(request.id, { op: "delete" });
		}, 1_000);

		const promise = relay.relay("s1", { op: "delete", path: "x.md" });
		await expect(promise).resolves.toEqual({ op: "delete" });

		vi.advanceTimersByTime(2_000);
	});

	test("reject clears pending with error message", async () => {
		const relay = new FileOpRelay((request) => {
			relay.reject(request.id, "File not found");
		}, 30_000);

		const promise = relay.relay("s1", { op: "read", path: "missing.md" });
		await expect(promise).rejects.toThrow("File not found");
	});

	test("rejectAll rejects all pending relays", async () => {
		const relay = new FileOpRelay(() => {}, 30_000);
		const first = relay.relay("s1", { op: "list" });
		const second = relay.relay("s1", { op: "read", path: "x.md" });

		relay.rejectAll("Agent stopped");
		await expect(first).rejects.toThrow("Agent stopped");
		await expect(second).rejects.toThrow("Agent stopped");
	});

	test("resolve/reject unknown id is a no-op", async () => {
		const relay = new FileOpRelay(() => {}, 30_000);
		expect(() => relay.resolve("bogus", { op: "delete" })).not.toThrow();
		expect(() => relay.reject("bogus", "err")).not.toThrow();
	});
});
