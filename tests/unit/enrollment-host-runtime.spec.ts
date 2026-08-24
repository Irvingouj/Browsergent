import { beforeEach, describe, expect, test, vi } from "vitest";
import { EnrollmentHost } from "../../src/controllers/enrollment-host";
import { MemoryStorage } from "../../src/storage/memory-storage";
import { createAgentTools } from "../../src/worker/agent-tools";
import { initBoundController } from "./session-test-utils";

describe("EnrollmentHost runtime", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	test("reset and stop go through the shared runtime, not a second JS engine", async () => {
		const { ctrl } = await initBoundController(storage);
		const reset = vi.fn().mockResolvedValue(undefined);
		const stop = vi.fn().mockResolvedValue(undefined);
		const host = new EnrollmentHost({
			storage,
			sessions: ctrl,
			tools: createAgentTools(vi.fn(), vi.fn(), vi.fn(), vi.fn()),
			runtime: { reset, stop },
		});
		const token = await host.generate();

		const resetResult = await host.handle({
			id: "req-reset",
			token,
			method: "reset",
		});
		expect(resetResult).toEqual({
			id: "req-reset",
			ok: true,
			method: "reset",
			result: "reset",
		});
		expect(reset).toHaveBeenCalledTimes(1);

		const stopResult = await host.handle({
			id: "req-stop",
			token,
			method: "stop",
		});
		expect(stopResult).toEqual({
			id: "req-stop",
			ok: true,
			method: "stop",
			result: "stopped",
		});
		expect(stop).toHaveBeenCalledTimes(1);
	});
});
