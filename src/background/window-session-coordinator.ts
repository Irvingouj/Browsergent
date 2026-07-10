/// <reference types="chrome" />
import type {
	GlobalRunningSessionsMessage,
	PanelRegisterMessage,
	PanelRunningUpdateMessage,
	PanelUnregisterMessage,
	WindowLifecycleMessage,
} from "../protocol/window-lifecycle";
import {
	isPanelRegisterMessage,
	isPanelRunningUpdateMessage,
	isPanelUnregisterMessage,
	isRequestGlobalRunningMessage,
} from "../protocol/window-lifecycle";
import { reportWarn, safeListener } from "./diag";
import {
	decisionToLifecycleMessage,
	type LifecycleDecision,
	WindowLifecycleTracker,
} from "./window-lifecycle-tracker";

type PanelEntry = {
	sessionId: string;
	running: Set<string>;
};

/** Pure lifecycle message builder — unit-tested without Chrome APIs. */
export class WindowSessionCoordinatorLogic {
	emitSplit(sourceWindowId: number, newWindowId: number): WindowLifecycleMessage {
		return {
			type: "windowLifecycle",
			kind: "split",
			sourceWindowId,
			newWindowId,
		};
	}

	emitMerge(
		removedWindowId: number,
		survivorWindowId: number,
		reboundRunningSessionIds: string[] = [],
	): WindowLifecycleMessage {
		return {
			type: "windowLifecycle",
			kind: "merge",
			removedWindowId,
			survivorWindowId,
			reboundRunningSessionIds:
				reboundRunningSessionIds.length > 0
					? reboundRunningSessionIds
					: undefined,
		};
	}

	emitClose(removedWindowId: number): WindowLifecycleMessage {
		return {
			type: "windowLifecycle",
			kind: "close",
			removedWindowId,
		};
	}
}

/** Tracks open sidepanels and their running sessions for cross-window badges. */
export class PanelRegistry {
	private readonly panels = new Map<number, PanelEntry>();

	register(windowId: number, sessionId: string): void {
		const existing = this.panels.get(windowId);
		this.panels.set(windowId, {
			sessionId,
			running: existing?.running ?? new Set(),
		});
	}

	unregister(windowId: number): { running: string[] } {
		const entry = this.panels.get(windowId);
		this.panels.delete(windowId);
		return { running: entry ? [...entry.running] : [] };
	}

	updateRunning(windowId: number, sessionIds: readonly string[]): void {
		const entry = this.panels.get(windowId);
		if (!entry) return;
		entry.running = new Set(sessionIds);
	}

	buildGlobalRunningMap(): Record<string, number> {
		const out: Record<string, number> = {};
		for (const [windowId, entry] of this.panels) {
			for (const sessionId of entry.running) {
				out[sessionId] = windowId;
			}
		}
		return out;
	}

	hasPanel(windowId: number): boolean {
		return this.panels.has(windowId);
	}
}

const registry = new PanelRegistry();
const lifecycleTracker = new WindowLifecycleTracker();
const handledWindowRemovals = new Set<number>();

/**
 * Single fanout path for lifecycle (B7 stability).
 * Prefer storage.session so panels that wake later still see the event;
 * do NOT dual-broadcast via runtime.sendMessage (historical SW loop risk).
 */
function broadcast(message: WindowLifecycleMessage): void {
	void chrome.storage?.session
		?.set?.({
			windowLifecycleEvent: { ...message, emittedAt: Date.now() },
		})
		?.catch?.((err: unknown) => {
			reportWarn({
				code: "E_SW_STORAGE",
				source: "lifecycle",
				message: "lifecycle storage broadcast failed",
				details: { kind: message.kind },
				cause: err,
			});
		});
}

const GLOBAL_RUNNING_STORAGE_KEY = "globalRunningBySession";

function broadcastGlobalRunning(): void {
	const bySession = registry.buildGlobalRunningMap();
	const message: GlobalRunningSessionsMessage = {
		type: "globalRunningSessions",
		bySession,
	};
	chrome.runtime
		?.sendMessage?.(message)
		?.catch?.((err: unknown) => {
			reportWarn({
				code: "E_SW_FANOUT",
				source: "sw",
				message: "globalRunning runtime broadcast failed",
				cause: err,
			});
		});
	void chrome.storage?.session
		?.set?.({ [GLOBAL_RUNNING_STORAGE_KEY]: bySession })
		?.catch?.((err: unknown) => {
			reportWarn({
				code: "E_SW_STORAGE",
				source: "sw",
				message: "globalRunning storage broadcast failed",
				cause: err,
			});
		});
}

function emitLifecycleDecision(
	decision: LifecycleDecision,
	reboundRunningSessionIds: string[] = [],
): void {
	const message = decisionToLifecycleMessage(
		decision,
		reboundRunningSessionIds,
	);
	if (message) broadcast(message);
}

function emitWindowRemoval(
	removedWindowId: number,
	reboundRunning: string[],
): void {
	if (handledWindowRemovals.has(removedWindowId)) return;
	handledWindowRemovals.add(removedWindowId);
	const decision = lifecycleTracker.consumeMerge(removedWindowId);
	emitLifecycleDecision(decision, reboundRunning);
	broadcastGlobalRunning();
}

function tryEmitMergeForPending(pending: {
	removedWindowId: number;
	survivorWindowId: number;
}): void {
	void chrome.windows
		.get(pending.removedWindowId)
		.then(() => {})
		.catch(() => {
			const { running: reboundRunning } = registry.unregister(
				pending.removedWindowId,
			);
			emitWindowRemoval(pending.removedWindowId, reboundRunning);
		});
}

function handlePanelRegister(message: PanelRegisterMessage): void {
	registry.register(message.windowId, message.sessionId);
	broadcastGlobalRunning();
}

function handlePanelUnregister(message: PanelUnregisterMessage): void {
	registry.unregister(message.windowId);
	broadcastGlobalRunning();
}

function handlePanelRunningUpdate(message: PanelRunningUpdateMessage): void {
	registry.updateRunning(message.windowId, message.runningSessionIds);
	broadcastGlobalRunning();
}

export function initWindowSessionCoordinator(): void {
	chrome.runtime?.onMessage?.addListener(
		safeListener(
			"panelLifecycleMessages",
			(message: unknown) => {
				if (isPanelRegisterMessage(message)) {
					handlePanelRegister(message);
					return;
				}
				if (isPanelUnregisterMessage(message)) {
					handlePanelUnregister(message);
					return;
				}
				if (isPanelRunningUpdateMessage(message)) {
					handlePanelRunningUpdate(message);
					return;
				}
				if (isRequestGlobalRunningMessage(message)) {
					broadcastGlobalRunning();
					return;
				}
			},
			"lifecycle",
		),
	);

	chrome.tabs?.onDetached?.addListener(
		safeListener(
			"tabs.onDetached",
			(tabId: number, detachInfo: chrome.tabs.TabDetachInfo) => {
				// Ignore tab moves from windows that never had a Browsergent panel.
				if (!registry.hasPanel(detachInfo.oldWindowId)) return;
				lifecycleTracker.onTabDetached(tabId, detachInfo.oldWindowId);
			},
			"lifecycle",
		),
	);

	chrome.tabs?.onRemoved?.addListener(
		safeListener(
			"tabs.onRemoved",
			(tabId: number) => {
				lifecycleTracker.onTabRemoved(tabId);
			},
			"lifecycle",
		),
	);

	chrome.tabs?.onAttached?.addListener(
		safeListener(
			"tabs.onAttached",
			(tabId: number, attachInfo: chrome.tabs.TabAttachInfo) => {
				const decision = lifecycleTracker.onTabAttached(
					tabId,
					attachInfo.newWindowId,
				);
				emitLifecycleDecision(decision);

				setTimeout(() => {
					try {
						const finalized = lifecycleTracker.finalizeDeferredAttach();
						emitLifecycleDecision(finalized);
						if (finalized.action === "none" && finalized.mergePending) {
							tryEmitMergeForPending(finalized.mergePending);
						}
					} catch (err) {
						reportWarn({
							code: "E_LIFECYCLE",
							source: "lifecycle",
							message: "finalizeDeferredAttach failed",
							cause: err,
						});
					}
				}, 0);
			},
			"lifecycle",
		),
	);

	chrome.windows?.onCreated?.addListener(
		safeListener(
			"windows.onCreated",
			(window: chrome.windows.Window) => {
				if (typeof window.id !== "number") return;
				const decision = lifecycleTracker.onWindowCreated(window.id);
				emitLifecycleDecision(decision);
			},
			"lifecycle",
		),
	);

	chrome.windows?.onRemoved?.addListener(
		safeListener(
			"windows.onRemoved",
			(removedWindowId: number) => {
				const hadPanel = registry.hasPanel(removedWindowId);
				const { running: reboundRunning } =
					registry.unregister(removedWindowId);
				if (!hadPanel && !lifecycleTracker.hasMergeTarget(removedWindowId)) {
					return;
				}
				setTimeout(() => {
					try {
						emitWindowRemoval(removedWindowId, reboundRunning);
					} catch (err) {
						reportWarn({
							code: "E_LIFECYCLE",
							source: "lifecycle",
							message: "emitWindowRemoval failed",
							details: { removedWindowId },
							cause: err,
						});
					}
				}, 0);
			},
			"lifecycle",
		),
	);
}

export { registry, lifecycleTracker };