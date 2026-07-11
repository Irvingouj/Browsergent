import { SessionController } from "../../src/controllers/session-controller";
import type { StorageBackend } from "../../src/storage/storage-backend";

export const TEST_WINDOW_ID = 1;

export async function initBoundController(
	storage: StorageBackend,
	windowId = TEST_WINDOW_ID,
): Promise<{ ctrl: SessionController; sessionId: string }> {
	const ctrl = new SessionController(storage);
	await ctrl.init();
	const sessionId = await ctrl.resolveOrCreateForWindow(windowId);
	return { ctrl, sessionId };
}

export function requireActiveId(ctrl: SessionController): string {
	const id = ctrl.getActiveSessionId();
	if (id === null) throw new Error("no active session");
	return id;
}
