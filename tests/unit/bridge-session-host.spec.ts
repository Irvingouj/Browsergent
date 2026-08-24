import { beforeEach, describe, expect, test } from "vitest";
import { BridgeSessionHost } from "../../src/controllers/bridge-session-host";
import { MemoryStorage } from "../../src/storage/memory-storage";
import {
	initBoundController,
	requireActiveId,
	TEST_WINDOW_ID,
} from "./session-test-utils";

describe("BridgeSessionHost session.create", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	test("CLI session.create appears in the same session list Chat uses", async () => {
		const { ctrl } = await initBoundController(storage);
		const chatId = requireActiveId(ctrl);
		const host = new BridgeSessionHost(ctrl);

		const created = await host.handle({
			id: "req-create",
			method: "session.create",
		});

		expect(created.ok).toBe(true);
		if (!created.ok || created.method !== "session.create") {
			throw new Error("expected session.create success");
		}
		expect(created.result.id).not.toBe(chatId);
		expect(created.result.messageCount).toBe(0);
		expect(created.result.windowId).toBe(TEST_WINDOW_ID);
		expect(created.result.lifecycle).toBe("background");

		const listed = await host.handle({
			id: "req-list",
			method: "session.list",
		});
		expect(listed.ok).toBe(true);
		if (!listed.ok || listed.method !== "session.list") {
			throw new Error("expected session.list success");
		}

		const ids = listed.result.sessions.map((session) => session.id);
		expect(ids).toContain(chatId);
		expect(ids).toContain(created.result.id);

		const chat = listed.result.sessions.find((session) => session.id === chatId);
		const cli = listed.result.sessions.find(
			(session) => session.id === created.result.id,
		);
		expect(chat?.lifecycle).toBe("foreground");
		expect(cli?.origin).toBe("cli");
		expect(ctrl.getActiveSessionId()).toBe(chatId);
		expect(cli?.messageCount).toBe(0);
		expect(cli?.windowId).toBe(TEST_WINDOW_ID);
	});
});
