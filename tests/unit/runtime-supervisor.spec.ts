import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { browsergentStore } from "../../src/state/store";

describe("js rebuild state transitions", () => {
	beforeEach(() => {
		const store = browsergentStore.getState();
		store.agentReset();
		store.jsDisposed();
	});

	afterEach(() => {
		browsergentStore.getState().agentReset();
		browsergentStore.getState().jsDisposed();
	});

	test("rebuild sequence: initializing -> restarting -> ready", () => {
		const store = browsergentStore.getState();
		store.jsInitializing();
		expect(browsergentStore.getState().js.status).toBe("initializing");

		store.jsRestarting("timeout");
		expect(browsergentStore.getState().js.status).toBe("restarting");

		store.jsReady();
		expect(browsergentStore.getState().js.status).toBe("ready");
		expect(browsergentStore.getState().js.lastError).toBeUndefined();
	});

	test("rebuild failure: restarting -> error", () => {
		const store = browsergentStore.getState();
		store.jsInitializing();
		store.jsRestarting("crash");
		store.jsFailed({ code: "E_JS_RUNTIME", message: "Rebuild failed" });
		expect(browsergentStore.getState().js.status).toBe("error");
		expect(browsergentStore.getState().js.lastError?.code).toBe(
			"E_JS_RUNTIME",
		);
	});

	test("recovery after rebuild failure: error -> initializing -> ready", () => {
		const store = browsergentStore.getState();
		store.jsInitializing();
		store.jsRestarting("crash");
		store.jsFailed({ code: "E_JS_RUNTIME", message: "Rebuild failed" });

		// Second attempt succeeds
		store.jsInitializing();
		store.jsReady();
		expect(browsergentStore.getState().js.status).toBe("ready");
		expect(browsergentStore.getState().js.lastError).toBeUndefined();
	});

	test("jsRunning -> jsReady round-trip", () => {
		const store = browsergentStore.getState();
		store.jsInitializing();
		store.jsReady();
		store.jsRunning();
		expect(browsergentStore.getState().js.status).toBe("running");
		store.jsReady();
		expect(browsergentStore.getState().js.status).toBe("ready");
	});
});
