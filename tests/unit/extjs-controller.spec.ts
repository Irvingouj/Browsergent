import { beforeEach, describe, expect, test, vi } from "vitest";
import { ExtjsController } from "../../src/controllers/extjs-controller";

vi.mock("../../src/skills/skill-service", () => ({
	getSkillService: vi.fn().mockReturnValue({
		ensureReady: vi.fn().mockResolvedValue({ listSkills: vi.fn() }),
		loadSkill: vi.fn().mockResolvedValue("skill body"),
	}),
}));

// Mock ExtensionJsClient — factory must be self-contained (hoisted)
vi.mock("../../src/sidepanel/extension-js-client", () => {
	const mockInit = vi.fn().mockResolvedValue(undefined);
	const mockDispose = vi.fn().mockResolvedValue(undefined);
	const mockHandleRelayRequest = vi.fn();
	const mockInstance = {
		init: mockInit,
		dispose: mockDispose,
		handleRelayRequest: mockHandleRelayRequest,
	};
	return {
		ExtensionJsClient: {
			getInstance: vi.fn().mockReturnValue(mockInstance),
			relayCallback: null,
		},
		__mockInstance: mockInstance,
	};
});

// Mock browsergentStore — factory must be self-contained
vi.mock("../../src/state/store", () => {
	const mockState = {
		extjsInitializing: vi.fn(),
		extjsReady: vi.fn(),
		extjsFailed: vi.fn(),
		extjsDisposed: vi.fn(),
	};
	return {
		browsergentStore: {
			getState: vi.fn().mockReturnValue(mockState),
		},
		__mockStoreState: mockState,
	};
});

async function getMocks() {
	const extjsMod = await import("../../src/sidepanel/extension-js-client");
	const storeMod = await import("../../src/state/store");
	return {
		mockInstance: (extjsMod as unknown as Record<string, unknown>)
			.__mockInstance as {
			init: ReturnType<typeof vi.fn>;
			dispose: ReturnType<typeof vi.fn>;
			handleRelayRequest: ReturnType<typeof vi.fn>;
		},
		mockStoreState: (storeMod as unknown as Record<string, unknown>)
			.__mockStoreState as Record<string, ReturnType<typeof vi.fn>>,
	};
}

async function getExtjsClientModule() {
	return await import("../../src/sidepanel/extension-js-client");
}

function makeBridge() {
	const posted: unknown[] = [];
	return {
		post: (msg: unknown) => posted.push(msg),
		posted,
	};
}

describe("ExtjsController", () => {
	beforeEach(async () => {
		const { mockInstance, mockStoreState } = await getMocks();
		mockInstance.init.mockClear().mockResolvedValue(undefined);
		mockInstance.dispose.mockClear().mockResolvedValue(undefined);
		mockInstance.handleRelayRequest.mockClear();
		mockStoreState.extjsInitializing.mockClear();
		mockStoreState.extjsReady.mockClear();
		mockStoreState.extjsFailed.mockClear();
		mockStoreState.extjsDisposed.mockClear();
	});

	test("init sets store to initializing then ready", async () => {
		const { mockStoreState } = await getMocks();
		const bridge = makeBridge();
		const ctrl = new ExtjsController(bridge as any);
		await ctrl.init();
		expect(mockStoreState.extjsInitializing).toHaveBeenCalled();
		expect(mockStoreState.extjsReady).toHaveBeenCalled();
	});

	test("init sets relayCallback that posts to bridge", async () => {
		const bridge = makeBridge();
		const ctrl = new ExtjsController(bridge as any);
		await ctrl.init();

		const extjsMod = await getExtjsClientModule();
		const callback = (
			extjsMod.ExtensionJsClient as unknown as {
				relayCallback: ((msg: unknown) => void) | null;
			}
		).relayCallback;
		expect(callback).not.toBeNull();
		callback?.({ type: "extjsRunResult", id: "r1", result: {} });
		expect(bridge.posted).toHaveLength(1);
	});

	test("init failure stores error and rethrows", async () => {
		const { mockInstance, mockStoreState } = await getMocks();
		mockInstance.init.mockRejectedValue(new Error("init failed"));
		const bridge = makeBridge();
		const ctrl = new ExtjsController(bridge as any);
		await expect(ctrl.init()).rejects.toThrow("init failed");
		expect(mockStoreState.extjsFailed).toHaveBeenCalled();
		expect(mockStoreState.extjsFailed.mock.calls[0][0].code).toBe(
			"E_JS_RUNTIME",
		);
	});

	test("handleRelayRequest delegates to client", async () => {
		const { mockInstance } = await getMocks();
		const bridge = makeBridge();
		const ctrl = new ExtjsController(bridge as any);
		await ctrl.init();
		const msg = { type: "extjsRunRequest" as const, id: "req-1", code: "1+1" };
		ctrl.handleRelayRequest(msg);
		expect(mockInstance.handleRelayRequest).toHaveBeenCalledWith(msg);
	});

	test("dispose sets disposed and clears relayCallback", async () => {
		const { mockInstance, mockStoreState } = await getMocks();
		const bridge = makeBridge();
		const ctrl = new ExtjsController(bridge as any);
		await ctrl.init();
		await ctrl.dispose();
		expect(mockStoreState.extjsDisposed).toHaveBeenCalled();
		const extjsMod = await getExtjsClientModule();
		expect(
			(extjsMod.ExtensionJsClient as unknown as { relayCallback: unknown })
				.relayCallback,
		).toBeNull();
		expect(mockInstance.dispose).toHaveBeenCalled();
	});

	test("dispose warns on client dispose failure", async () => {
		const { mockInstance } = await getMocks();
		mockInstance.dispose.mockRejectedValue(new Error("dispose failed"));
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const bridge = makeBridge();
		const ctrl = new ExtjsController(bridge as any);
		await ctrl.init();
		await ctrl.dispose();
		expect(warnSpy).toHaveBeenCalledWith(
			"Extjs dispose failed:",
			expect.any(Error),
		);
		warnSpy.mockRestore();
	});
});
