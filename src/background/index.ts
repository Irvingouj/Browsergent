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
		"swDelay",
		(
			message: unknown,
			_sender: chrome.runtime.MessageSender,
			sendResponse: (response?: unknown) => void,
		) => {
			if (
				typeof message !== "object" ||
				message === null ||
				(message as { type?: string }).type !== "swDelay"
			) {
				return;
			}
			const ms = Number((message as { ms?: number }).ms);
			const delay = Number.isFinite(ms) && ms > 0 ? Math.min(ms, 30_000) : 1_000;
			// SW timers are not subject to background-tab throttling like panel pages.
			setTimeout(() => {
				sendResponse({ ok: true });
			}, delay);
			return true;
		},
		"sw",
	),
);

chrome.runtime?.onMessage?.addListener(
	safeListener(
		"resolvePanelWindowId",
		(
			message: unknown,
			sender: chrome.runtime.MessageSender,
			sendResponse: (response?: unknown) => void,
		) => {
			if (
				typeof message !== "object" ||
				message === null ||
				(message as { type?: string }).type !== "resolvePanelWindowId"
			) {
				return;
			}
			const windowId =
				typeof sender.tab?.windowId === "number"
					? sender.tab.windowId
					: typeof sender.documentId === "string" &&
							typeof (sender as { windowId?: number }).windowId === "number"
						? (sender as { windowId?: number }).windowId
						: null;
			// MV3 extension pages often send without tab; use last focused as hint.
			if (typeof windowId === "number" && windowId > 0) {
				sendResponse({ windowId });
				return true;
			}
			void chrome.windows
				?.getLastFocused?.()
				?.then((w) => {
					sendResponse({
						windowId: typeof w?.id === "number" ? w.id : 0,
					});
				})
				?.catch?.(() => {
					sendResponse({ windowId: 0 });
				});
			return true;
		},
		"sw",
	),
);

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
