import { describe, expect, test, beforeEach, vi } from "vitest";
import { SessionController } from "../../src/controllers/session-controller";
import { MemoryStorage } from "../../src/storage/memory-storage";

describe("SessionController.load", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	test("returns null for non-object storage data", async () => {
		await storage.set("sessions", "current", "not an object");
		const ctrl = new SessionController(storage);
		const result = await ctrl.load();
		expect(result).toBeNull();
	});

	test("returns null when messages is not an array", async () => {
		await storage.set("sessions", "current", {
			messages: "not an array",
			trace: [],
			timestamp: Date.now(),
		});
		const ctrl = new SessionController(storage);
		const result = await ctrl.load();
		expect(result).toBeNull();
	});

	test("returns null when trace is not an array", async () => {
		await storage.set("sessions", "current", {
			messages: [],
			trace: "not an array",
			timestamp: Date.now(),
		});
		const ctrl = new SessionController(storage);
		const result = await ctrl.load();
		expect(result).toBeNull();
	});

	test("returns snapshot for valid data", async () => {
		const data = {
			messages: [{ kind: "user", id: "1", text: "hi", timestamp: 0 }],
			trace: [],
			timestamp: Date.now(),
		};
		await storage.set("sessions", "current", data);
		const ctrl = new SessionController(storage);
		const result = await ctrl.load();
		expect(result).not.toBeNull();
		expect(result?.messages).toEqual(data.messages);
		expect(result?.trace).toEqual(data.trace);
	});

	test("scheduleSave debounces correctly", async () => {
		vi.useFakeTimers();
		const ctrl = new SessionController(storage);
		ctrl.hydrated = true;

		const messages = [{ id: "1", kind: "user" as const, text: "a", timestamp: 1 }];
		const trace = [{ id: "t1", step: 1, status: "done" as const, toolName: "run_lua", timestamp: 1 }];

		ctrl.scheduleSave(messages, trace);
		ctrl.scheduleSave(messages, trace);
		ctrl.scheduleSave(messages, trace);

		expect(await ctrl.load()).toBeNull();

		vi.advanceTimersByTime(500);
		expect(await ctrl.load()).not.toBeNull();

		vi.useRealTimers();
	});
});
