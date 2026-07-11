import { beforeEach, describe, expect, test } from "vitest";
import { SessionController } from "../../src/controllers/session-controller";
import { SessionRunSink } from "../../src/controllers/session-run-sink";
import { MemoryStorage } from "../../src/storage/memory-storage";

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

	test("persists headless run events to the correct session", async () => {
		const sessionId = await controller.createSessionAttachedTo(1);
		await sink.applyEvent(sessionId, {
			type: "agentMessage",
			runId: "run-1",
			message: {
				kind: "assistant",
				id: "a1",
				text: "Background reply",
				timestamp: 1,
			},
		});
		await sink.flush(sessionId);

		const loaded = await controller.loadForSession(sessionId);
		expect(loaded?.messages).toEqual([
			{
				kind: "assistant",
				id: "a1",
				text: "Background reply",
				timestamp: 1,
			},
		]);
	});

	test("concurrent applyEvent calls do not drop events for the same session", async () => {
		const sessionId = await controller.createSessionAttachedTo(1);
		await Promise.all([
			sink.applyEvent(sessionId, {
				type: "agentMessage",
				runId: "run-1",
				message: {
					kind: "assistant",
					id: "a1",
					text: "First",
					timestamp: 1,
				},
			}),
			sink.applyEvent(sessionId, {
				type: "agentMessage",
				runId: "run-1",
				message: {
					kind: "assistant",
					id: "a2",
					text: "Second",
					timestamp: 2,
				},
			}),
		]);
		await sink.flush(sessionId);
		const loaded = await controller.loadForSession(sessionId);
		expect(loaded?.messages).toHaveLength(2);
	});

	test("does not overwrite a different session", async () => {
		const sessionA = await controller.createSessionAttachedTo(1);
		const sessionB = await controller.createSessionAttachedTo(1);

		await controller.saveForSession(
			sessionB,
			[{ kind: "user", id: "u-b", text: "B only", timestamp: 1 }],
			[],
			[],
		);

		await sink.applyEvent(sessionA, {
			type: "agentMessage",
			runId: "run-a",
			message: {
				kind: "assistant",
				id: "a1",
				text: "A reply",
				timestamp: 2,
			},
		});
		await sink.flush(sessionA);

		const loadedB = await controller.loadForSession(sessionB);
		expect(loadedB?.messages).toEqual([
			{ kind: "user", id: "u-b", text: "B only", timestamp: 1 },
		]);
	});
});
