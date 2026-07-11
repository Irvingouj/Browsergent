import {
	isOffscreenPanelRelayResponse,
	isOffscreenRunCommandMessage,
} from "../protocol/offscreen-run";
import type { PanelToWorker } from "../types/messages";

const workers = new Map<string, Worker>();

function publish(sessionId: string, event: unknown): void {
	chrome.runtime
		?.sendMessage?.({ type: "offscreenRunEvent", sessionId, event })
		?.catch?.(() => {});
}

function ensureWorker(sessionId: string): Worker {
	const existing = workers.get(sessionId);
	if (existing) return existing;

	const worker = new Worker(chrome.runtime.getURL("agent-worker.js"), {
		type: "module",
	});
	worker.onmessage = (event: MessageEvent<unknown>) => {
		publish(sessionId, event.data);
	};
	workers.set(sessionId, worker);
	return worker;
}

function handleCommand(
	sessionId: string,
	_windowId: number,
	message: PanelToWorker,
): void {
	const worker = ensureWorker(sessionId);
	worker.postMessage(message);
}

if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
	chrome.runtime.sendMessage({ type: "offscreenHostReady" }).catch(() => {});
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
	chrome.runtime.onMessage.addListener((message: unknown) => {
		void chrome.storage?.session
			?.set?.({ offscreenLastMessage: message })
			?.catch?.(() => {});
		if (isOffscreenRunCommandMessage(message)) {
			handleCommand(message.sessionId, message.windowId, message.message);
			return;
		}
		if (isOffscreenPanelRelayResponse(message)) {
			for (const worker of workers.values()) {
				worker.postMessage(message.message);
				break;
			}
		}
	});
}
