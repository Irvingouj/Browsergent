import { beforeEach, describe, expect, test, vi } from "vitest";
import { EnrollmentHost } from "../../src/controllers/enrollment-host";
import { MemoryStorage } from "../../src/storage/memory-storage";
import { createAgentTools } from "../../src/worker/agent-tools";
import { initBoundController } from "./session-test-utils";

describe("EnrollmentHost persistence", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	test("a generated token is still there after reconstructing the host", async () => {
		const { ctrl } = await initBoundController(storage);
		const tools = createAgentTools(vi.fn(), vi.fn(), vi.fn(), vi.fn());
		const first = new EnrollmentHost({
			storage,
			sessions: ctrl,
			tools,
		});
		const token = await first.generate();

		const second = new EnrollmentHost({
			storage,
			sessions: ctrl,
			tools,
		});
		expect(await second.token()).toBe(token);
	});

	test("a successful CLI pairing is still enrolled after reconstructing the host", async () => {
		const { ctrl } = await initBoundController(storage);
		const tools = createAgentTools(vi.fn(), vi.fn(), vi.fn(), vi.fn());
		const first = new EnrollmentHost({
			storage,
			sessions: ctrl,
			tools,
		});
		const token = await first.generate();
		const status = await first.handle({
			id: "req-status",
			token,
			method: "status",
		});
		expect(status.ok).toBe(true);
		expect(first.cliEnrolled()).toBe(true);

		const restored: boolean[] = [];
		const second = new EnrollmentHost({
			storage,
			sessions: ctrl,
			tools,
			onCliEnrolled: (value) => restored.push(value),
		});
		await second.restoreCliEnrollment();
		expect(second.cliEnrolled()).toBe(true);
		expect(restored).toContain(true);
	});
});
