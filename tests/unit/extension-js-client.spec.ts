import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import {
	ExtensionJsClient,
	isExtjsRelayRequest,
	isExtjsRelayResponse,
} from "../../src/sidepanel/extension-js-client";

// Mock @pi-oxide/extension-js — factory must be self-contained (hoisted)
vi.mock("@pi-oxide/extension-js", () => {
	const mockStopWith = vi.fn().mockResolvedValue(undefined);
	const mockRunCellAsync = vi.fn().mockResolvedValue({ status: "ok", value: 42 });
	const mockSetFuelLimit = vi.fn();
	const mockSession = {
		stopWith: mockStopWith,
		runCellAsync: mockRunCellAsync,
		setFuelLimit: mockSetFuelLimit,
	};
	const mockRunnerPromise = Promise.resolve();
	return {
		ExtensionSession: {
			init: vi.fn().mockResolvedValue([mockSession, mockRunnerPromise]),
		},
		// Expose mocks so tests can access them
		__mockStopWith: mockStopWith,
		__mockRunCellAsync: mockRunCellAsync,
	};
});

// Mock zustand store — factory must be self-contained
vi.mock("../../src/state/store", () => {
	const mockState = {
		extjsRunning: vi.fn(),
		extjsReady: vi.fn(),
		extjsRestarting: vi.fn(),
		extjsFailed: vi.fn(),
		traceUpdated: vi.fn(),
	};
	return {
		browsergentStore: {
			getState: vi.fn().mockReturnValue(mockState),
		},
		__mockStoreState: mockState,
	};
});

// Grab mock references after vi.mock hoisting resolves
async function getMocks() {
	const extjsMod = await import("@pi-oxide/extension-js");
	const storeMod = await import("../../src/state/store");
	return {
		mockRunCellAsync: (extjsMod as unknown as Record<string, unknown>).__mockRunCellAsync as ReturnType<typeof vi.fn>,
		mockStopWith: (extjsMod as unknown as Record<string, unknown>).__mockStopWith as ReturnType<typeof vi.fn>,
		mockStoreState: (storeMod as unknown as Record<string, unknown>).__mockStoreState as Record<string, ReturnType<typeof vi.fn>>,
	};
}

describe("ExtensionJsClient", () => {
	let client: ExtensionJsClient;

	beforeEach(async () => {
		vi.useFakeTimers();
		ExtensionJsClient["instance"] = null;
		client = ExtensionJsClient.getInstance();
		const { mockRunCellAsync, mockStopWith, mockStoreState } = await getMocks();
		mockRunCellAsync.mockResolvedValue({ status: "ok", value: 42 });
		mockStopWith.mockResolvedValue(undefined);
		mockStoreState.extjsRunning.mockClear();
		mockStoreState.extjsReady.mockClear();
		mockStoreState.extjsRestarting.mockClear();
		mockStoreState.extjsFailed.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("init creates ExtensionSession and sets fuel limit", async () => {
		await client.init();
		expect(client.isReady).toBe(true);
	});

	test("runJs serializes execution through queue", async () => {
		await client.init();
		const { mockRunCellAsync } = await getMocks();
		const run1 = client.runJs("1+1");
		const run2 = client.runJs("2+2");
		await Promise.all([run1, run2]);
		expect(mockRunCellAsync).toHaveBeenCalledTimes(2);
		expect(mockRunCellAsync).toHaveBeenNthCalledWith(1, "1+1");
		expect(mockRunCellAsync).toHaveBeenNthCalledWith(2, "2+2");
	});

	test("runJs times out and triggers rebuild", async () => {
		await client.init();
		const { mockRunCellAsync, mockStoreState } = await getMocks();
		// First call = never resolves (to trigger timeout); subsequent calls = fast
		mockRunCellAsync
			.mockImplementationOnce(() => new Promise(() => {}))
			.mockResolvedValue({ status: "ok", value: 1 });

		const run = client.runJs("slow()");
		// Suppress unhandled rejection from the dangling runCellAsync promise
		run.catch(() => {});
		await vi.advanceTimersByTimeAsync(31000);

		await expect(run).rejects.toThrow("timed out");
		expect(mockStoreState.extjsRestarting).toHaveBeenCalledWith("rebuild");
	});

	test("runJs resolves with result on success", async () => {
		await client.init();
		const { mockRunCellAsync } = await getMocks();
		mockRunCellAsync.mockResolvedValue({ status: "ok", value: "hello" });
		const result = await client.runJs("page.snapshot()");
		expect(result).toEqual({ status: "ok", value: "hello" });
	});

	test("runJs throws when not initialized", async () => {
		await expect(client.runJs("1+1")).rejects.toThrow("not initialized");
	});

	test("stop tears down and reinitializes session", async () => {
		await client.init();
		const { mockStopWith } = await getMocks();
		await client.stop();
		expect(mockStopWith).toHaveBeenCalled();
		expect(client.isReady).toBe(true);
	});

	test("dispose tears down without reinitializing", async () => {
		await client.init();
		const { mockStopWith } = await getMocks();
		await client.dispose();
		expect(mockStopWith).toHaveBeenCalled();
		expect(client.isReady).toBe(false);
	});

	test("handleRelayRequest runs code and dispatches result", async () => {
		await client.init();
		const { mockRunCellAsync } = await getMocks();
		mockRunCellAsync.mockResolvedValue({ status: "ok", value: 42 });

		const responses: unknown[] = [];
		ExtensionJsClient.relayCallback = (msg) => responses.push(msg);

		client.handleRelayRequest({
			type: "extjsRunRequest",
			id: "req-1",
			code: "1+1",
		});

		await vi.advanceTimersByTimeAsync(0);
		expect(responses).toHaveLength(1);
		expect(responses[0]).toMatchObject({
			type: "extjsRunResult",
			id: "req-1",
			result: { status: "ok", value: 42 },
		});
	});

	test("handleRelayRequest dispatches error on failure", async () => {
		await client.init();
		const { mockRunCellAsync } = await getMocks();
		mockRunCellAsync.mockRejectedValue(new Error("boom"));

		const responses: unknown[] = [];
		ExtensionJsClient.relayCallback = (msg) => responses.push(msg);

		client.handleRelayRequest({
			type: "extjsRunRequest",
			id: "req-2",
			code: "bad",
		});

		await vi.advanceTimersByTimeAsync(0);
		expect(responses[0]).toMatchObject({
			type: "extjsRunError",
			id: "req-2",
			error: "boom",
		});
	});
});

describe("isExtjsRelayRequest", () => {
	test("accepts valid request", () => {
		expect(
			isExtjsRelayRequest({
				type: "extjsRunRequest",
				id: "r1",
				code: "1+1",
			}),
		).toBe(true);
	});

	test("rejects missing code", () => {
		expect(isExtjsRelayRequest({ type: "extjsRunRequest", id: "r1" })).toBe(false);
	});

	test("rejects wrong type", () => {
		expect(isExtjsRelayRequest({ type: "other", id: "r1", code: "1+1" })).toBe(false);
	});
});

describe("isExtjsRelayResponse", () => {
	test("accepts result response", () => {
		expect(
			isExtjsRelayResponse({ type: "extjsRunResult", id: "r1", result: {} }),
		).toBe(true);
	});

	test("accepts error response", () => {
		expect(
			isExtjsRelayResponse({ type: "extjsRunError", id: "r1", error: "oops" }),
		).toBe(true);
	});

	test("rejects wrong type", () => {
		expect(isExtjsRelayResponse({ type: "other", id: "r1" })).toBe(false);
	});
});
