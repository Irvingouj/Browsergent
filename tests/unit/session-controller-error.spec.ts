import { beforeEach, describe, expect, test } from "vitest";
import { SessionController } from "../../src/controllers/session-controller";
import { browsergentStore } from "../../src/state/store";
import { MemoryStorage } from "../../src/storage/memory-storage";

/** MemoryStorage whose set/remove reject only after `rejecting` is flipped on,
 *  so SessionController.init() can complete before we simulate failure. */
class RejectingStorage extends MemoryStorage {
	rejecting = false;
	override async set<T>(store: string, key: string, value: T): Promise<void> {
		if (this.rejecting) throw new Error("quota exceeded");
		await super.set(store, key, value);
	}
	override async remove(store: string, key: string): Promise<void> {
		if (this.rejecting) throw new Error("remove denied");
		await super.remove(store, key);
	}
}

describe("SessionController error surfacing", () => {
	beforeEach(() => {
		browsergentStore.getState().agentReset();
	});

	test("save() failure lands E_SESSION_STORE in store", async () => {
		const storage = new RejectingStorage();
		const ctrl = new SessionController(storage);
		await ctrl.init();
		storage.rejecting = true;
		ctrl.hydrated = true;

		await ctrl.save([{ id: "1", kind: "user", text: "hi", timestamp: 0 }], []);

		const error = browsergentStore.getState().session.error;
		expect(error?.code).toBe("E_SESSION_STORE");
		expect(error?.source).toBe("session");
		expect(error?.details?.operation).toBe("save");
	});

	test("clear() failure lands E_SESSION_STORE with operation clear", async () => {
		const storage = new RejectingStorage();
		const ctrl = new SessionController(storage);
		await ctrl.init();
		storage.rejecting = true;
		ctrl.hydrated = true;

		await ctrl.clear();

		const error = browsergentStore.getState().session.error;
		expect(error?.code).toBe("E_SESSION_STORE");
		expect(error?.details?.operation).toBe("clear");
	});

	test("sessionErrorDismissed clears the error", () => {
		browsergentStore.getState().sessionStoreFailed({
			code: "E_SESSION_STORE",
			message: "boom",
			source: "session",
		});
		expect(browsergentStore.getState().session.error?.code).toBe(
			"E_SESSION_STORE",
		);
		browsergentStore.getState().sessionErrorDismissed();
		expect(browsergentStore.getState().session.error).toBeUndefined();
	});
});
