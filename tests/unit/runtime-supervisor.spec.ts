import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { browsergentStore } from "../../src/state/store";

describe("lua rebuild state transitions", () => {
	beforeEach(() => {
		const store = browsergentStore.getState();
		store.agentReset();
		store.luaDisposed();
	});

	afterEach(() => {
		browsergentStore.getState().agentReset();
		browsergentStore.getState().luaDisposed();
	});

	test("rebuild sequence: initializing -> restarting -> ready", () => {
		const store = browsergentStore.getState();
		store.luaInitializing();
		expect(browsergentStore.getState().lua.status).toBe("initializing");

		store.luaRestarting("timeout");
		expect(browsergentStore.getState().lua.status).toBe("restarting");

		store.luaReady();
		expect(browsergentStore.getState().lua.status).toBe("ready");
		expect(browsergentStore.getState().lua.lastError).toBeUndefined();
	});

	test("rebuild failure: restarting -> error", () => {
		const store = browsergentStore.getState();
		store.luaInitializing();
		store.luaRestarting("crash");
		store.luaFailed({ code: "E_LUA_RUNTIME", message: "Rebuild failed" });
		expect(browsergentStore.getState().lua.status).toBe("error");
		expect(browsergentStore.getState().lua.lastError?.code).toBe(
			"E_LUA_RUNTIME",
		);
	});

	test("recovery after rebuild failure: error -> initializing -> ready", () => {
		const store = browsergentStore.getState();
		store.luaInitializing();
		store.luaRestarting("crash");
		store.luaFailed({ code: "E_LUA_RUNTIME", message: "Rebuild failed" });

		// Second attempt succeeds
		store.luaInitializing();
		store.luaReady();
		expect(browsergentStore.getState().lua.status).toBe("ready");
		expect(browsergentStore.getState().lua.lastError).toBeUndefined();
	});

	test("luaRunning -> luaReady round-trip", () => {
		const store = browsergentStore.getState();
		store.luaInitializing();
		store.luaReady();
		store.luaRunning();
		expect(browsergentStore.getState().lua.status).toBe("running");
		store.luaReady();
		expect(browsergentStore.getState().lua.status).toBe("ready");
	});
});
