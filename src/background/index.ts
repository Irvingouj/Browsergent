/**
 * Background service worker.
 *
 * Browser command routing is handled by extension-js's runner directly
 * from the side panel main thread.
 * Window/session lifecycle is coordinated here for split and merge events.
 *
 * All listeners are safeListener-wrapped so a single throw cannot kill the SW.
 */

import { isSessionRunRelayMessage } from "../protocol/offscreen-run";
import {
	initBackgroundDiagnostics,
	reportError,
	reportWarn,
	safeListener,
} from "./diag";
import { initWindowSessionCoordinator } from "./window-session-coordinator";

initBackgroundDiagnostics();
initWindowSessionCoordinator();

chrome.runtime?.onMessage?.addListener(
	safeListener(
		"sessionRunRelay",
		(message: unknown, sender: chrome.runtime.MessageSender) => {
			if (!isSessionRunRelayMessage(message)) return;

			void chrome.storage?.session
				?.set?.({
					[`runRelay:${message.sessionId}`]: {
						event: message.event,
						emittedAt: Date.now(),
					},
				})
				?.catch?.((err: unknown) => {
					reportWarn({
						code: "E_SW_STORAGE",
						source: "sw",
						message: "runRelay storage set failed",
						details: { sessionId: message.sessionId },
						cause: err,
					});
				});

			// Fan out only when a sidepanel posts the relay. Without this guard the
			// service worker re-broadcasts to itself and can spin until it crashes.
			if (!sender.url?.includes("/sidepanel.html")) return;

			void chrome.runtime
				.sendMessage(message)
				.catch((err: unknown) => {
					reportWarn({
						code: "E_SW_FANOUT",
						source: "relay",
						message: "sessionRunRelay fanout failed",
						details: { sessionId: message.sessionId },
						cause: err,
					});
				});
		},
		"relay",
	),
);

chrome.action.onClicked.addListener(
	safeListener(
		"action.onClicked",
		async (tab: chrome.tabs.Tab) => {
			if (!tab.id) return;
			try {
				await chrome.sidePanel.open({ tabId: tab.id });
			} catch (err) {
				reportError({
					code: "E_SW_LISTENER",
					source: "sw",
					message: "sidePanel.open failed",
					details: { tabId: tab.id },
					cause: err,
				});
			}
		},
		"sw",
	),
);
