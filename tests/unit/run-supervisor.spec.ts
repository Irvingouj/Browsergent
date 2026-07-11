import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RunSupervisor } from "../../src/controllers/run-supervisor";
import { SessionController } from "../../src/controllers/session-controller";
import { browsergentStore } from "../../src/state/store";
import { MemoryStorage } from "../../src/storage/memory-storage";

describe("RunSupervisor", () => {
	let storage: MemoryStorage;
	let controller: SessionController;
	let supervisor: RunSupervisor;
	let postMessageSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		browsergentStore.getState().agentReset();
		browsergentStore.getState().clearChat();
		storage = new MemoryStorage();
		controller = new SessionController(storage);
		await controller.init();
		controller.bindPanelWindow(1);

		postMessageSpy = vi.fn();
		const MockWorker = function MockWorker() {
			return {
				onmessage: null,
				onerror: null,
				postMessage: postMessageSpy,
				terminate: vi.fn(),
			};
		};
		vi.stubGlobal("Worker", vi.fn(MockWorker));
		vi.stubGlobal("chrome", {
			runtime: { getURL: vi.fn().mockReturnValue("/agent-worker.js") },
		});

		supervisor = new RunSupervisor(
			controller,
			{
				onExtjsRunRequest: () => {},
				onExtjsDocsRequest: () => {},
				onLoadSkillRequest: () => {},
				onFileOpRequest: () => {},
			},
			{ hosting: "local" },
		);
	});

	afterEach(() => {
		supervisor.dispose();
		vi.unstubAllGlobals();
	});

	test("stopForegroundRun posts agentStop with store runId when omitted", async () => {
		const sessionA = await controller.resolveOrCreateForWindow(1);
		supervisor.setForegroundSession(sessionA);
		supervisor.registerRun(sessionA, "run-stop-test");
		browsergentStore.getState().agentRunRequested("run-stop-test");
		supervisor.ensureWorkerForSession(sessionA);

		postMessageSpy.mockClear();
		supervisor.stopForegroundRun();
		expect(postMessageSpy).toHaveBeenCalledWith({
			type: "agentStop",
			runId: "run-stop-test",
		});
	});

	test("detach keeps registry entry headless", async () => {
		const sessionA = await controller.resolveOrCreateForWindow(1);
		supervisor.startForeground(sessionA);
		supervisor.registerRun(sessionA, "run-a");
		supervisor.detachToHeadless(sessionA);
		expect(supervisor.getRegistry().isRunning(sessionA)).toBe(true);
		expect(supervisor.getRegistry().shouldUpdateUi("run-a")).toBe(false);
	});

	test("attach restores foreground UI state for running session", async () => {
		const sessionA = await controller.resolveOrCreateForWindow(1);
		supervisor.startForeground(sessionA);
		supervisor.registerRun(sessionA, "run-a");
		supervisor.getRegistry().updateStatus("run-a", "executing_tool");
		supervisor.detachToHeadless(sessionA);
		supervisor.resetForegroundUi();

		const sessionB = await controller.createSessionAttachedTo(1);
		supervisor.attachForeground(sessionB);
		expect(browsergentStore.getState().agent.status).toBe("idle");

		supervisor.attachForeground(sessionA);
		expect(browsergentStore.getState().agent.activeRunId).toBe("run-a");
		expect(browsergentStore.getState().agent.status).toBe("executing_tool");
	});

	test("onAgentStopped does not fire while another session is still running", async () => {
		const onAgentStopped = vi.fn();
		supervisor.dispose();
		supervisor = new RunSupervisor(
			controller,
			{
				onExtjsRunRequest: () => {},
				onExtjsDocsRequest: () => {},
				onLoadSkillRequest: () => {},
				onFileOpRequest: () => {},
				onAgentStopped,
			},
			{ hosting: "local" },
		);

		const sessionA = await controller.resolveOrCreateForWindow(1);
		const sessionB = await controller.createSessionAttachedTo(1);
		supervisor.startForeground(sessionA);
		supervisor.registerRun(sessionA, "run-a");
		supervisor.registerRun(sessionB, "run-b");
		supervisor.detachToHeadless(sessionA);
		supervisor.attachForeground(sessionB);

		const workerA = (globalThis.Worker as ReturnType<typeof vi.fn>).mock
			.results[0]?.value;
		workerA.onmessage?.({
			data: {
				type: "agentStatus",
				runId: "run-a",
				status: "stopped",
			},
		});

		expect(onAgentStopped).not.toHaveBeenCalled();
	});

	test("headless events persist without updating foreground chat", async () => {
		const sessionA = await controller.resolveOrCreateForWindow(1);
		const sessionB = await controller.createSessionAttachedTo(1);
		supervisor.startForeground(sessionA);
		supervisor.registerRun(sessionA, "run-a");
		supervisor.detachToHeadless(sessionA);
		supervisor.attachForeground(sessionB);
		browsergentStore.getState().clearChat();

		const bridgeA = supervisor.ensureBridge(sessionA);
		const workerA = (globalThis.Worker as ReturnType<typeof vi.fn>).mock
			.results[0]?.value;
		workerA.onmessage?.({
			data: {
				type: "agentMessage",
				runId: "run-a",
				message: {
					kind: "assistant",
					id: "a1",
					text: "headless done",
					timestamp: 1,
				},
			},
		});

		await new Promise((r) => setTimeout(r, 400));
		expect(browsergentStore.getState().chat.messageIds).toHaveLength(0);
		const loaded = await controller.loadForSession(sessionA);
		expect(loaded?.messages.some((m) => m.text === "headless done")).toBe(true);
		void bridgeA;
	});

	test("isLocalWorkerHost stays true after terminal while bridge remains", async () => {
		const sessionA = await controller.resolveOrCreateForWindow(1);
		supervisor.startForeground(sessionA);
		supervisor.ensureBridge(sessionA);
		supervisor.registerRun(sessionA, "run-a");
		expect(supervisor.isLocalWorkerHost(sessionA)).toBe(true);
		supervisor.getRegistry().clear(sessionA);
		// Registry cleared (terminal), but local bridge still owns the session.
		expect(supervisor.getRegistry().isRunning(sessionA)).toBe(false);
		expect(supervisor.isLocalWorkerHost(sessionA)).toBe(true);
	});

	test("applyRemoteRunEvent does not pollute chat for foreign session", async () => {
		const sessionA = await controller.resolveOrCreateForWindow(1);
		const sessionB = "foreign-session-b";
		supervisor.startForeground(sessionA);
		browsergentStore.getState().clearChat();

		supervisor.applyRemoteRunEvent(sessionB, {
			type: "agentMessage",
			runId: "run-b",
			message: {
				kind: "user",
				id: "u-foreign",
				text: "only in B",
				timestamp: 1,
			},
		});
		supervisor.applyRemoteRunEvent(sessionB, {
			type: "agentTextDelta",
			runId: "run-b",
			messageId: "a-foreign",
			text: "Merged content",
		});
		supervisor.applyRemoteRunEvent(sessionB, {
			type: "agentStatus",
			runId: "run-b",
			status: "running",
		});

		expect(browsergentStore.getState().chat.messageIds).toHaveLength(0);
		expect(supervisor.getRegistry().isRunning(sessionB)).toBe(true);
		expect(supervisor.getRegistry().shouldUpdateUi("run-b")).toBe(false);

		supervisor.applyRemoteRunEvent(sessionB, {
			type: "agentStatus",
			runId: "run-b",
			status: "done",
		});
		expect(supervisor.getRegistry().isRunning(sessionB)).toBe(false);
	});
});
