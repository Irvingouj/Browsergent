/**
 * B9 / B5 structural guarantees: cold boot must not eagerly seed skills or
 * create agent workers; settings load must not wait on session body hydrate.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("intent-driven boot contracts (shipped modules)", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	test("ExtjsController.init does not call SkillService.ensureReady", async () => {
		const ensureReady = vi.fn().mockResolvedValue({});
		vi.doMock("../../src/skills/skill-service", () => ({
			getSkillService: () => ({
				ensureReady,
				loadSkill: vi.fn(),
			}),
		}));

		const mockClient = {
			init: vi.fn().mockResolvedValue(undefined),
			setOnFsMutation: vi.fn(),
		};
		vi.doMock("../../src/sidepanel/extension-js-client", () => ({
			ExtensionJsClient: {
				getInstance: () => mockClient,
				relayCallback: null,
			},
			normalizeJsError: (e: unknown) => e,
		}));

		// normalizeJsError is from errors — keep real
		vi.doUnmock("../../src/errors/normalize-error");

		const { ExtjsController } = await import(
			"../../src/controllers/extjs-controller"
		);
		const ctrl = new ExtjsController(() => {});
		await ctrl.init({ windowId: 1 });
		expect(mockClient.init).toHaveBeenCalled();
		expect(ensureReady).not.toHaveBeenCalled();
	});

	test("RunSupervisor.startForeground does not construct Worker", async () => {
		const WorkerMock = vi.fn(function MockWorker(this: {
			postMessage: ReturnType<typeof vi.fn>;
			terminate: ReturnType<typeof vi.fn>;
		}) {
			this.postMessage = vi.fn();
			this.terminate = vi.fn();
		});
		vi.stubGlobal("Worker", WorkerMock);
		vi.stubGlobal("chrome", {
			runtime: { getURL: () => "/agent-worker.js" },
		});

		const { RunSupervisor } = await import(
			"../../src/controllers/run-supervisor"
		);
		const { SessionController } = await import(
			"../../src/controllers/session-controller"
		);
		const { MemoryStorage } = await import(
			"../../src/storage/memory-storage"
		);

		const storage = new MemoryStorage();
		const sessions = new SessionController(storage);
		await sessions.init();
		sessions.bindPanelWindow(1);
		const id = await sessions.resolveOrCreateForWindow(1);

		const supervisor = new RunSupervisor(
			sessions,
			{
				onExtjsRunRequest: () => {},
				onExtjsDocsRequest: () => {},
				onLoadSkillRequest: () => {},
				onFileOpRequest: () => {},
			},
			{ hosting: "local" },
		);
		supervisor.startForeground(id);
		expect(WorkerMock).not.toHaveBeenCalled();

		supervisor.ensureWorkerForSession(id);
		expect(WorkerMock).toHaveBeenCalledTimes(1);
		supervisor.dispose();
	});

	test("SettingsController.load completes without SessionController", async () => {
		const { SettingsController } = await import(
			"../../src/controllers/settings-controller"
		);
		const { MemoryStorage } = await import(
			"../../src/storage/memory-storage"
		);
		const { browsergentStore } = await import("../../src/state/store");

		browsergentStore.getState().settingsLoaded({
			providers: [],
			activeProviderId: null,
			loaded: false,
		});
		const storage = new MemoryStorage();
		const settings = new SettingsController(storage);
		await settings.load();
		expect(browsergentStore.getState().settings.loaded).toBe(true);
	});
});
