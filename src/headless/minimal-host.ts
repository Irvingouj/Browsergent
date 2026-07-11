/**
 * Minimal offscreen worker host — avoids heavy panel imports that can fail
 * to load in the offscreen document context.
 */

import { WorkerBridge } from "../controllers/worker-bridge";
import type { PanelToWorker, WorkerToPanel } from "../types/messages";

const bridges = new Map<string, WorkerBridge>();

function publish(sessionId: string, event: WorkerToPanel): void {
	chrome.runtime
		?.sendMessage?.({ type: "offscreenRunEvent", sessionId, event })
		?.catch?.(() => {});
}

function ensureBridge(sessionId: string): WorkerBridge {
	const existing = bridges.get(sessionId);
	if (existing) return existing;

	const bridge = new WorkerBridge({
		onExtjsRunRequest: (msg) => {
			publish(sessionId, msg);
		},
		onExtjsDocsRequest: (msg) => {
			publish(sessionId, msg);
		},
		onLoadSkillRequest: (msg) => {
			publish(sessionId, msg);
		},
		onFileOpRequest: (msg) => {
			publish(sessionId, msg);
		},
		runRouting: {
			shouldUpdateUi: () => true,
			shouldApplyBridgeEffects: () => false,
			onRunEvent: (_runId, event) => {
				publish(sessionId, event);
			},
		},
		onWorkerReady: () => {
			publish(sessionId, { type: "workerReady" });
		},
	});
	bridge.start();
	bridges.set(sessionId, bridge);
	return bridge;
}

export function handleOffscreenCommand(
	sessionId: string,
	_windowId: number,
	message: PanelToWorker,
): void {
	const bridge = ensureBridge(sessionId);
	if (message.type === "agentStop") {
		bridge.post(message);
		return;
	}
	bridge.post(message);
}

export function handleOffscreenRelayResponse(
	requestId: string,
	message: PanelToWorker,
): void {
	for (const bridge of bridges.values()) {
		bridge.post(message);
		void requestId;
		break;
	}
}
