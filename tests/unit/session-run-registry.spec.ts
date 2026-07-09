import { beforeEach, describe, expect, test } from "vitest";
import { SessionRunRegistry } from "../../src/controllers/session-run-registry";

describe("SessionRunRegistry", () => {
	let registry: SessionRunRegistry;

	beforeEach(() => {
		registry = new SessionRunRegistry();
	});

	test("register tracks run per session as foreground", () => {
		registry.register("session-a", "run-1", "running");
		const state = registry.getBySession("session-a");
		expect(state).toEqual({
			sessionId: "session-a",
			runId: "run-1",
			status: "running",
			attachment: "foreground",
		});
		expect(registry.getByRunId("run-1")?.sessionId).toBe("session-a");
		expect(registry.isRunning("session-a")).toBe(true);
	});

	test("detach marks session headless while run continues", () => {
		registry.register("session-a", "run-1", "executing_tool");
		registry.detach("session-a");
		expect(registry.getBySession("session-a")?.attachment).toBe("headless");
		expect(registry.isRunning("session-a")).toBe(true);
	});

	test("attach restores foreground attachment for running session", () => {
		registry.register("session-a", "run-1", "running");
		registry.detach("session-a");
		registry.attach("session-a");
		expect(registry.getBySession("session-a")?.attachment).toBe("foreground");
	});

	test("updateStatus tracks agent lifecycle", () => {
		registry.register("session-a", "run-1", "loading");
		registry.updateStatus("run-1", "waiting_for_model");
		expect(registry.getByRunId("run-1")?.status).toBe("waiting_for_model");
	});

	test("clear removes finished run", () => {
		registry.register("session-a", "run-1", "running");
		registry.clear("session-a");
		expect(registry.isRunning("session-a")).toBe(false);
		expect(registry.getByRunId("run-1")).toBeUndefined();
	});

	test("multiple sessions can run concurrently", () => {
		registry.register("session-a", "run-a", "running");
		registry.register("session-b", "run-b", "executing_tool");
		registry.detach("session-a");
		expect(registry.isRunning("session-a")).toBe(true);
		expect(registry.isRunning("session-b")).toBe(true);
		expect(registry.getRunningSessionIds()).toEqual(
			expect.arrayContaining(["session-a", "session-b"]),
		);
	});

	test("shouldUpdateUi is true only for foreground attachment", () => {
		registry.register("session-a", "run-a", "running");
		registry.register("session-b", "run-b", "running");
		registry.detach("session-a");
		expect(registry.shouldUpdateUi("run-a")).toBe(false);
		expect(registry.shouldUpdateUi("run-b")).toBe(true);
	});
});