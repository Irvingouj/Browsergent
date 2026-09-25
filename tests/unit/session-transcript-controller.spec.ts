import { beforeEach, describe, expect, test } from "vitest";
import { SessionController } from "../../src/controllers/session-controller";
import { MemoryStorage } from "../../src/storage/memory-storage";
import type { ChatMessage } from "../../src/types/messages";
import {
	initBoundController,
	transcriptFromMessages,
} from "./session-test-utils";

describe("SessionController transcript branching", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	test("selecting a transcript leaf changes the active path but keeps old branches", async () => {
		const { ctrl, sessionId } = await initBoundController(storage);
		const messages: ChatMessage[] = [
			{ kind: "user", id: "u1", text: "First question", timestamp: 1 },
			{ kind: "assistant", id: "a1", text: "First answer", timestamp: 2 },
			{ kind: "user", id: "u2", text: "Second question", timestamp: 3 },
			{ kind: "assistant", id: "a2", text: "Second answer", timestamp: 4 },
		];
		const transcript = transcriptFromMessages(messages);
		await ctrl.saveForSession(sessionId, messages, [], [], transcript);

		const selected = await ctrl.selectTranscriptLeaf(sessionId, "u1");
		const stored = await ctrl.getSessionRecord(sessionId);

		expect(selected?.history.map((entry) => entry.entryId)).toEqual(["u1"]);
		expect(selected?.messages).toEqual([messages[0]]);
		expect(Object.keys(stored?.transcript.entries ?? {})).toEqual([
			"u1",
			"a1",
			"u2",
			"a2",
		]);
		expect(stored?.transcript.leafId).toBe("u1");
	});

	test("UI snapshot saves cannot replace the transcript authority", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();
		const sessionId = await ctrl.resolveOrCreateForWindow(1);
		const messages: ChatMessage[] = [
			{ kind: "user", id: "u1", text: "Question", timestamp: 1 },
			{ kind: "assistant", id: "a1", text: "Answer", timestamp: 2 },
		];
		await ctrl.saveForSession(
			sessionId,
			messages,
			[],
			[],
			transcriptFromMessages(messages),
		);
		await ctrl.selectTranscriptLeaf(sessionId, "u1");

		await ctrl.save(messages, []);

		const loaded = await ctrl.loadForSession(sessionId);
		expect(loaded?.history.map((entry) => entry.entryId)).toEqual(["u1"]);
		expect(loaded?.messages).toEqual([messages[0]]);
	});

	test("fork creates a child session seeded from the selected branch", async () => {
		const { ctrl, sessionId } = await initBoundController(storage);
		const messages: ChatMessage[] = [
			{ kind: "user", id: "u1", text: "First question", timestamp: 1 },
			{ kind: "assistant", id: "a1", text: "First answer", timestamp: 2 },
			{ kind: "user", id: "u2", text: "Second question", timestamp: 3 },
			{ kind: "assistant", id: "a2", text: "Second answer", timestamp: 4 },
		];
		await ctrl.saveForSession(
			sessionId,
			messages,
			[],
			[],
			transcriptFromMessages(messages),
		);

		const fork = await ctrl.forkSession(sessionId, "a1");
		if (!fork) throw new Error("fork was not created");

		expect(fork.sessionId).not.toBe(sessionId);
		expect(ctrl.getActiveSessionId()).toBe(fork.sessionId);
		expect(fork.session.history.map((entry) => entry.entryId)).toEqual([
			"u1",
			"a1",
		]);
		expect(fork.session.messages).toEqual(messages.slice(0, 2));
		expect(
			(await ctrl.getSessionRecord(fork.sessionId))?.forkedFromSessionId,
		).toBe(sessionId);
		const parent = await ctrl.getSessionRecord(sessionId);
		expect(parent?.transcript.leafId).toBe("a2");
	});
});
