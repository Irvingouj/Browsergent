import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { browsergentStore } from "../../src/state/store";

describe("extjs rebuild state transitions", () => {
	beforeEach(() => {
		const store = browsergentStore.getState();
		store.agentReset();
		store.extjsDisposed();
	});

	afterEach(() => {
		browsergentStore.getState().agentReset();
		browsergentStore.getState().extjsDisposed();
	});

	test("rebuild sequence: initializing -> restarting -> ready", () => {
		const store = browsergentStore.getState();
		store.extjsInitializing();
		expect(browsergentStore.getState().extjs.status).toBe("initializing");

		store.extjsRestarting("timeout");
		expect(browsergentStore.getState().extjs.status).toBe("restarting");

		store.extjsReady();
		expect(browsergentStore.getState().extjs.status).toBe("ready");
		expect(browsergentStore.getState().extjs.lastError).toBeUndefined();
	});

	test("rebuild failure: restarting -> error", () => {
		const store = browsergentStore.getState();
		store.extjsInitializing();
		store.extjsRestarting("crash");
		store.extjsFailed({ code: "E_JS_RUNTIME", message: "Rebuild failed" });
		expect(browsergentStore.getState().extjs.status).toBe("error");
		expect(browsergentStore.getState().extjs.lastError?.code).toBe(
			"E_JS_RUNTIME",
		);
	});

	test("recovery after rebuild failure: error -> initializing -> ready", () => {
		const store = browsergentStore.getState();
		store.extjsInitializing();
		store.extjsRestarting("crash");
		store.extjsFailed({ code: "E_JS_RUNTIME", message: "Rebuild failed" });

		// Second attempt succeeds
		store.extjsInitializing();
		store.extjsReady();
		expect(browsergentStore.getState().extjs.status).toBe("ready");
		expect(browsergentStore.getState().extjs.lastError).toBeUndefined();
	});

	test("extjsRunning -> jsReady round-trip", () => {
		const store = browsergentStore.getState();
		store.extjsInitializing();
		store.extjsReady();
		store.extjsRunning();
		expect(browsergentStore.getState().extjs.status).toBe("running");
		store.extjsReady();
		expect(browsergentStore.getState().extjs.status).toBe("ready");
	});
});
