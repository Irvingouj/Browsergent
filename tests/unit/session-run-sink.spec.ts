import { beforeEach, describe, expect, test } from "vitest";
import { SessionController } from "../../src/controllers/session-controller";
import { SessionRunSink } from "../../src/controllers/session-run-sink";
import { MemoryStorage } from "../../src/storage/memory-storage";
import type { ChatMessage } from "../../src/types/messages";
import { transcriptPath } from "../../src/types/session-transcript";
import { transcriptFromMessages } from "./session-test-utils";

describe("SessionRunSink", () => {
	let storage: MemoryStorage;
	let controller: SessionController;
	let sink: SessionRunSink;

	beforeEach(async () => {
		storage = new MemoryStorage();
		controller = new SessionController(storage);
		await controller.init();
		sink = new SessionRunSink(controller);
	});

	test("persists headless transcript events to the correct session", async () => {
		const sessionId = await controller.createSessionAttachedTo(1);
		const transcript = transcriptFromMessages([
			{ kind: "user", id: "u1", text: "Question", timestamp: 1 },
			{ kind: "assistant", id: "a1", text: "Background reply", timestamp: 2 },
		]);
		for (const entry of transcriptPath(transcript)) {
			await sink.applyEvent(sessionId, {
				type: "agentHistoryMessage",
				runId: "run-1",
				entry,
			});
		}
		await sink.flush(sessionId);

		const loaded = await controller.loadForSession(sessionId);
		expect(loaded?.messages).toEqual([
			{ kind: "user", id: "u1", text: "Question", timestamp: 1 },
			{
				kind: "assistant",
				id: "a1",
				text: "Background reply",
				timestamp: 2,
			},
		]);
		expect(loaded?.history.map((entry) => entry.entryId)).toEqual(["u1", "a1"]);
	});

	test("concurrent applyEvent calls preserve transcript parent order", async () => {
		const sessionId = await controller.createSessionAttachedTo(1);
		const transcript = transcriptFromMessages([
			{ kind: "user", id: "u1", text: "First", timestamp: 1 },
			{ kind: "assistant", id: "a1", text: "Second", timestamp: 2 },
		]);
		const [userEntry, assistantEntry] = transcriptPath(transcript);
		if (!userEntry || !assistantEntry)
			throw new Error("missing fixture entries");

		await Promise.all([
			sink.applyEvent(sessionId, {
				type: "agentHistoryMessage",
				runId: "run-1",
				entry: userEntry,
			}),
			sink.applyEvent(sessionId, {
				type: "agentHistoryMessage",
				runId: "run-1",
				entry: assistantEntry,
			}),
		]);
		await sink.flush(sessionId);

		const loaded = await controller.loadForSession(sessionId);
		expect(loaded?.history.map((entry) => entry.entryId)).toEqual(["u1", "a1"]);
	});

	test("a rejected history event does not drop the next one", async () => {
		const sessionId = await controller.createSessionAttachedTo(1);
		const transcript = transcriptFromMessages([
			{ kind: "user", id: "u1", text: "Question", timestamp: 1 },
			{ kind: "assistant", id: "a1", text: "Answer", timestamp: 2 },
		]);
		const [userEntry, assistantEntry] = transcriptPath(transcript);
		if (!userEntry || !assistantEntry) {
			throw new Error("missing fixture entries");
		}

		const rejected = sink.applyEvent(sessionId, {
			type: "agentHistoryMessage",
			runId: "run-1",
			entry: assistantEntry,
		});
		const kept = sink.applyEvent(sessionId, {
			type: "agentHistoryMessage",
			runId: "run-1",
			entry: userEntry,
		});
		await expect(rejected).rejects.toThrow(/parent mismatch/);
		await kept;
		await sink.flush(sessionId);

		const loaded = await controller.loadForSession(sessionId);
		expect(loaded?.history.map((entry) => entry.entryId)).toEqual(["u1"]);
	});

	test("retries a session load after the first read fails", async () => {
		const sessionId = await controller.createSessionAttachedTo(1);
		const loadForSession = controller.loadForSession.bind(controller);
		let calls = 0;
		controller.loadForSession = async (id) => {
			calls += 1;
			if (calls === 1) throw new Error("idb down");
			return loadForSession(id);
		};

		await expect(
			sink.applyEvent(sessionId, {
				type: "agentTrace",
				runId: "run-1",
				entry: {
					id: "t1",
					step: 1,
					status: "done",
					toolName: "run_js",
					result: "ok",
					timestamp: 1,
				},
			}),
		).rejects.toThrow("idb down");

		await sink.applyEvent(sessionId, {
			type: "agentTrace",
			runId: "run-1",
			entry: {
				id: "t2",
				step: 2,
				status: "done",
				toolName: "run_js",
				result: "kept",
				timestamp: 2,
			},
		});
		await sink.flush(sessionId);

		const loaded = await controller.loadForSession(sessionId);
		expect(loaded?.trace.map((entry) => entry.id)).toEqual(["t2"]);
	});

	test("does not overwrite a different session", async () => {
		const sessionA = await controller.createSessionAttachedTo(1);
		const sessionB = await controller.createSessionAttachedTo(1);
		const message: ChatMessage = {
			kind: "user",
			id: "u-b",
			text: "B only",
			timestamp: 1,
		};
		const transcriptB = transcriptFromMessages([message]);
		await controller.saveForSession(sessionB, [message], [], [], transcriptB);

		const transcriptA = transcriptFromMessages([
			{ kind: "assistant", id: "a1", text: "A reply", timestamp: 2 },
		]);
		const [entryA] = transcriptPath(transcriptA);
		if (!entryA) throw new Error("missing fixture entry");
		await sink.applyEvent(sessionA, {
			type: "agentHistoryMessage",
			runId: "run-a",
			entry: entryA,
		});
		await sink.flush(sessionA);

		const loadedB = await controller.loadForSession(sessionB);
		expect(loadedB?.messages).toEqual([message]);
	});
});
