import { beforeEach, describe, expect, test } from "vitest";
import { BridgeGate } from "../../src/controllers/bridge-gate";
import { BridgeSessionHost } from "../../src/controllers/bridge-session-host";
import { EnrollmentController } from "../../src/controllers/enrollment-controller";
import { MemoryStorage } from "../../src/storage/memory-storage";
import { initBoundController, requireActiveId } from "./session-test-utils";

describe("BridgeGate enrollment", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	test("CLI session.create is rejected until the enrollment token is generated and presented", async () => {
		const { ctrl } = await initBoundController(storage);
		const chatId = requireActiveId(ctrl);
		const enrollment = new EnrollmentController(storage);
		const gate = new BridgeGate({
			enrollment,
			sessions: new BridgeSessionHost(ctrl),
		});

		const unpaired = await gate.handle({
			id: "req-unpaired",
			token: "guess",
			method: "session.create",
		});
		expect(unpaired.ok).toBe(false);
		if (unpaired.ok) throw new Error("expected unpaired failure");
		expect(unpaired.error.code).toBe("E_NOT_PAIRED");

		const token = await enrollment.generate();
		expect(token.length).toBeGreaterThan(8);

		const wrong = await gate.handle({
			id: "req-wrong",
			token: "guess",
			method: "session.create",
		});
		expect(wrong.ok).toBe(false);
		if (wrong.ok) throw new Error("expected wrong-token failure");
		expect(wrong.error.code).toBe("E_NOT_PAIRED");

		const created = await gate.handle({
			id: "req-create",
			token,
			method: "session.create",
		});
		expect(created.ok).toBe(true);
		if (!created.ok || created.method !== "session.create") {
			throw new Error("expected session.create success");
		}
		expect(created.result.id).not.toBe(chatId);

		const listed = await gate.handle({
			id: "req-list",
			token,
			method: "session.list",
		});
		expect(listed.ok).toBe(true);
		if (!listed.ok || listed.method !== "session.list") {
			throw new Error("expected session.list success");
		}
		const ids = listed.result.sessions.map((session) => session.id);
		expect(ids).toContain(chatId);
		expect(ids).toContain(created.result.id);
	});
});
