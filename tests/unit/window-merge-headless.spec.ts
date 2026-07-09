import { beforeEach, describe, expect, test, vi } from "vitest";
import { ExtjsController } from "../../src/controllers/extjs-controller";
import { SessionController } from "../../src/controllers/session-controller";
import { MemoryStorage } from "../../src/storage/memory-storage";

vi.mock("../../src/skills/skill-service", () => ({
	getSkillService: vi.fn().mockReturnValue({
		ensureReady: vi.fn().mockResolvedValue(undefined),
	}),
}));

const { rebindWindow, getWindowId } = vi.hoisted(() => ({
	rebindWindow: vi.fn(),
	getWindowId: vi.fn().mockReturnValue(1),
}));

vi.mock("../../src/sidepanel/extension-js-client", () => ({
	ExtensionJsClient: {
		getInstance: vi.fn().mockReturnValue({
			init: vi.fn().mockResolvedValue(undefined),
			getWindowId,
			rebindWindow,
			setOnFsMutation: vi.fn(),
			handleRelayRequest: vi.fn(),
			handleDocsRelayRequest: vi.fn(),
			dispose: vi.fn().mockResolvedValue(undefined),
			stop: vi.fn().mockResolvedValue(undefined),
		}),
		relayCallback: null,
	},
}));

vi.mock("../../src/state/store", () => ({
	browsergentStore: {
		getState: vi.fn().mockReturnValue({
			extjsInitializing: vi.fn(),
			extjsReady: vi.fn(),
			extjsFailed: vi.fn(),
			extjsDisposed: vi.fn(),
		}),
	},
}));

describe("window merge during headless", () => {
	let storage: MemoryStorage;
	let sessionCtrl: SessionController;

	beforeEach(async () => {
		rebindWindow.mockClear();
		storage = new MemoryStorage();
		sessionCtrl = new SessionController(storage);
		await sessionCtrl.init();
	});

	test("applyWindowMerge rebinds removed-window sessions to survivor", async () => {
		const sb = await sessionCtrl.resolveOrCreateForWindow(2);
		await sessionCtrl.applyWindowMerge(2, 1);
		const record = await sessionCtrl.getSessionRecord(sb);
		expect(record?.windowId).toBe(1);
		expect(record?.lifecycle).toBe("background");
	});

	test("extjs rebindWindow targets survivor after merge", async () => {
		const ctrl = new ExtjsController(() => {});
		await ctrl.init({ windowId: 1 });
		ctrl.rebindWindow(1);
		expect(rebindWindow).toHaveBeenCalledWith(1);
	});
});