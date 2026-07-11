import type { SessionController } from "../controllers/session-controller";
import { reportError, reportWarn, sendMessageSafe } from "../errors/report";
import {
	type GlobalRunningSessionsMessage,
	isGlobalRunningSessionsMessage,
	isWindowLifecycleMessage,
	type WindowLifecycleMessage,
} from "../protocol/window-lifecycle";

export function lifecycleEventKey(message: WindowLifecycleMessage): string {
	switch (message.kind) {
		case "split":
			return `split:${message.sourceWindowId}:${message.newWindowId}`;
		case "merge":
			return `merge:${message.removedWindowId}:${message.survivorWindowId}`;
		case "close":
			return `close:${message.removedWindowId}`;
	}
}

/** Prefer SW delay (unthrottled) over page setTimeout (throttled in bg tabs). */
async function swDelay(ms: number): Promise<void> {
	if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
		try {
			await chrome.runtime.sendMessage({ type: "swDelay", ms });
			return;
		} catch {
			// fall through
		}
	}
	await new Promise<void>((r) => setTimeout(r, ms));
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
	return Promise.race([
		p,
		swDelay(ms).then(() => {
			throw new Error(`${label} timeout`);
		}),
		// Page timer as backup when SW messaging is also stuck (focused tab OK).
		new Promise<T>((_, reject) => {
			setTimeout(() => reject(new Error(`${label} timeout`)), ms);
		}),
	]);
}

/**
 * Resolve this panel document's Chrome window id.
 * Cache + in-flight dedupe; callers that need a guaranteed id use waitForWindowId.
 */
let cachedWindowId: number | null = null;
let resolveInFlight: Promise<number> | null = null;

/** Test-only: clear module window-id cache between cases. */
export function resetWindowIdCacheForTests(): void {
	cachedWindowId = null;
	resolveInFlight = null;
}

/** Optional ?windowId=N query (E2E openSecondWindow / diagnostics). */
function windowIdFromLocation(): number {
	try {
		if (typeof location === "undefined") return 0;
		const raw = new URLSearchParams(location.search).get("windowId");
		const n = raw ? Number(raw) : 0;
		return Number.isFinite(n) && n > 0 ? n : 0;
	} catch {
		return 0;
	}
}

async function resolveWindowIdUncached(): Promise<number> {
	const fromQuery = windowIdFromLocation();
	if (fromQuery > 0) return fromQuery;

	if (typeof chrome === "undefined") return 0;

	if (chrome.runtime?.sendMessage) {
		try {
			const response = (await chrome.runtime.sendMessage({
				type: "resolvePanelWindowId",
			})) as { windowId?: number } | undefined;
			if (typeof response?.windowId === "number" && response.windowId > 0) {
				return response.windowId;
			}
		} catch {
			// fall through
		}
	}

	if (chrome.tabs?.getCurrent) {
		try {
			const tab = await chrome.tabs.getCurrent();
			if (typeof tab?.windowId === "number" && tab.windowId > 0) {
				return tab.windowId;
			}
		} catch {
			// fall through
		}
	}

	if (chrome.windows?.getCurrent) {
		try {
			const w = await chrome.windows.getCurrent();
			if (typeof w.id === "number") return w.id;
		} catch {
			// give up
		}
	}
	return 0;
}

export async function getCurrentWindowId(): Promise<number> {
	const fromQuery = windowIdFromLocation();
	if (fromQuery > 0) {
		cachedWindowId = fromQuery;
		return fromQuery;
	}
	if (cachedWindowId !== null && cachedWindowId > 0) {
		return cachedWindowId;
	}
	if (!resolveInFlight) {
		resolveInFlight = resolveWindowIdUncached()
			.then((id) => {
				if (id > 0) cachedWindowId = id;
				return id;
			})
			.finally(() => {
				resolveInFlight = null;
			});
	}
	// Prefer waiting for in-flight resolve (B1 needs real windowId before attach).
	// Tests inject windowId via WindowContextController.init({ windowId }).
	try {
		return await withTimeout(resolveInFlight, 5_000, "getCurrentWindowId");
	} catch {
		return cachedWindowId ?? 0;
	}
}

/** Await background window-id resolution. */
export async function waitForWindowId(maxMs = 10_000): Promise<number> {
	if (cachedWindowId !== null && cachedWindowId > 0) return cachedWindowId;
	if (!resolveInFlight) {
		void getCurrentWindowId();
	}
	if (cachedWindowId !== null && cachedWindowId > 0) return cachedWindowId;
	if (!resolveInFlight) return cachedWindowId ?? 0;
	try {
		return await withTimeout(resolveInFlight, maxMs, "waitForWindowId");
	} catch {
		return cachedWindowId ?? 0;
	}
}

export type WindowContextInitOptions = {
	/**
	 * Explicit window id (tests / already known). When set, skips chrome resolve
	 * and always uses this id for resolveOrCreateForWindow (B1/B2 attach path).
	 */
	windowId?: number;
	/**
	 * Called if a later durable resolveOrCreate yields a different session id
	 * than the shell initially bound (IDB recovered after ephemeral attach).
	 */
	onSessionResolved?: (sessionId: string, windowId: number) => void;
};

export class WindowContextController {
	private windowId: number | null = null;

	constructor(private readonly sessionController: SessionController) {}

	getWindowId(): number | null {
		return this.windowId;
	}

	/**
	 * Bind this panel to a chrome window and attach the correct session.
	 *
	 * Uses resolveOrCreateForWindow when meta is loaded — never mints a new
	 * session when panelActiveSession already exists (B1). Never blocks shell
	 * paint on hung IDB (B8): falls back to in-memory attach and persists later.
	 */
	async init(
		options?: WindowContextInitOptions,
	): Promise<{ windowId: number; sessionId: string }> {
		let windowId = options?.windowId ?? 0;
		if (windowId > 0) {
			cachedWindowId = windowId;
		} else {
			const fromQuery = (() => {
				try {
					const raw = new URLSearchParams(location.search).get("windowId");
					const n = raw ? Number(raw) : 0;
					return Number.isFinite(n) && n > 0 ? n : 0;
				} catch {
					return 0;
				}
			})();
			if (fromQuery > 0) {
				windowId = fromQuery;
				cachedWindowId = fromQuery;
			} else {
				// Focused first panel: chrome APIs usually respond; bounded by withTimeout.
				windowId = await getCurrentWindowId();
			}
		}

		this.windowId = windowId > 0 ? windowId : null;
		if (windowId <= 0) {
			reportWarn({
				code: "E_BOOT_WINDOW",
				source: "boot",
				message:
					"could not resolve panel window id; tab ownership isolation may be disabled",
				details: { windowId },
			});
		} else {
			// Required so getActiveSessionId() works after re-init (B1 / handleRun).
			this.sessionController.bindPanelWindow(windowId);
		}

		// Kick meta load without blocking if already in flight / hung.
		if (!this.sessionController.isMetaLoaded()) {
			void this.sessionController.init().catch((err: unknown) => {
				reportWarn({
					code: "E_BOOT_SESSION",
					source: "boot",
					message: "background session meta load failed",
					cause: err,
				});
			});
		}

		// B1: if meta already has panelActive for this window, use it immediately.
		const existing =
			windowId > 0
				? this.sessionController.getPanelActiveSessionId(windowId)
				: null;

		let sessionId: string;
		if (existing) {
			// bindPanelWindow already called above — do not skip panel binding on restore.
			sessionId = existing;
		} else if (this.sessionController.isMetaLoaded()) {
			// Durable attach path — may touch IDB (create / list).
			try {
				sessionId = await withTimeout(
					this.sessionController.resolveOrCreateForWindow(windowId),
					4_000,
					"resolveOrCreateForWindow",
				);
			} catch (err) {
				reportWarn({
					code: "E_BOOT_SESSION",
					source: "boot",
					message:
						err instanceof Error
							? err.message
							: "resolveOrCreateForWindow failed; ephemeral attach",
					cause: err,
				});
				sessionId = this.sessionController.adoptEphemeralSession(windowId);
				void this.sessionController
					.persistEphemeralSession(windowId, sessionId)
					.catch(() => {
						/* best-effort */
					});
			}
		} else {
			// Meta not ready — shell paint with ephemeral; re-resolve when meta loads.
			sessionId = this.sessionController.adoptEphemeralSession(windowId);
			void (async () => {
				try {
					await this.sessionController.init();
					const durable =
						await this.sessionController.resolveOrCreateForWindow(windowId);
					if (durable && durable !== sessionId && options?.onSessionResolved) {
						options.onSessionResolved(durable, windowId);
					} else if (durable === sessionId) {
						void this.sessionController
							.persistEphemeralSession(windowId, sessionId)
							.catch(() => {
								/* ok */
							});
					}
				} catch {
					void this.sessionController
						.persistEphemeralSession(windowId, sessionId)
						.catch(() => {
							/* ok */
						});
				}
			})();
		}

		if (windowId > 0 && typeof chrome !== "undefined" && chrome.runtime) {
			void sendMessageSafe(
				{ type: "panelRegister", windowId, sessionId },
				{ source: "panel", op: "panelRegister" },
			);
		}

		return { windowId, sessionId };
	}

	requestGlobalRunningSnapshot(): void {
		if (typeof chrome === "undefined" || !chrome.runtime) {
			return;
		}
		void sendMessageSafe(
			{ type: "requestGlobalRunning" },
			{ source: "panel", op: "requestGlobalRunning" },
		);
	}

	reportRunningSessions(runningSessionIds: string[]): void {
		if (
			this.windowId === null ||
			typeof chrome === "undefined" ||
			!chrome.runtime
		) {
			return;
		}
		void sendMessageSafe(
			{
				type: "panelRunningUpdate",
				windowId: this.windowId,
				runningSessionIds,
			},
			{ source: "panel", op: "panelRunningUpdate" },
		);
	}

	subscribeLifecycle(
		handler: (message: WindowLifecycleMessage) => void,
	): () => void {
		const cleanups: Array<() => void> = [];
		const seen = new Set<string>();
		const deliver = (message: WindowLifecycleMessage) => {
			const key = lifecycleEventKey(message);
			if (seen.has(key)) return;
			seen.add(key);
			try {
				handler(message);
			} catch (err) {
				reportError({
					code: "E_LIFECYCLE",
					source: "lifecycle",
					message: "lifecycle handler threw",
					details: { kind: message.kind },
					cause: err,
				});
			}
		};

		if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
			const listener = (
				message: unknown,
				_sender: chrome.runtime.MessageSender,
			) => {
				if (isWindowLifecycleMessage(message)) {
					deliver(message);
				}
			};
			chrome.runtime.onMessage.addListener(listener);
			cleanups.push(() => {
				chrome.runtime.onMessage.removeListener(listener);
			});
		}

		if (typeof chrome !== "undefined" && chrome.storage?.session?.onChanged) {
			const storageListener = (
				changes: { [key: string]: chrome.storage.StorageChange },
				areaName?: string,
			) => {
				if (areaName !== undefined && areaName !== "session") return;
				const change = changes.windowLifecycleEvent;
				if (!change?.newValue || typeof change.newValue !== "object") return;
				const { emittedAt: _emittedAt, ...lifecycle } =
					change.newValue as WindowLifecycleMessage & { emittedAt?: number };
				if (isWindowLifecycleMessage(lifecycle)) {
					deliver(lifecycle);
				}
			};
			chrome.storage.session.onChanged.addListener(storageListener);
			cleanups.push(() => {
				chrome.storage.session.onChanged.removeListener(storageListener);
			});
		}

		return () => {
			for (const cleanup of cleanups) cleanup();
		};
	}

	subscribeGlobalRunning(
		handler: (message: GlobalRunningSessionsMessage) => void,
	): () => void {
		const cleanups: Array<() => void> = [];

		if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
			const listener = (
				message: unknown,
				_sender: chrome.runtime.MessageSender,
			) => {
				if (isGlobalRunningSessionsMessage(message)) {
					try {
						handler(message);
					} catch (err) {
						reportError({
							code: "E_HOST_UNKNOWN",
							source: "panel",
							message: "globalRunning handler threw",
							cause: err,
						});
					}
				}
			};
			chrome.runtime.onMessage.addListener(listener);
			cleanups.push(() => {
				chrome.runtime.onMessage.removeListener(listener);
			});
		}

		if (typeof chrome !== "undefined" && chrome.storage?.session?.onChanged) {
			const storageListener = (
				changes: { [key: string]: chrome.storage.StorageChange },
				areaName?: string,
			) => {
				if (areaName !== undefined && areaName !== "session") return;
				const change = changes.globalRunningBySession;
				if (!change) return;
				const bySession =
					typeof change.newValue === "object" && change.newValue !== null
						? (change.newValue as Record<string, number>)
						: {};
				try {
					handler({ type: "globalRunningSessions", bySession });
				} catch (err) {
					reportError({
						code: "E_HOST_UNKNOWN",
						source: "panel",
						message: "globalRunning storage handler threw",
						cause: err,
					});
				}
			};
			chrome.storage.session.onChanged.addListener(storageListener);
			cleanups.push(() => {
				chrome.storage.session.onChanged.removeListener(storageListener);
			});
			void chrome.storage.session
				.get("globalRunningBySession")
				.then((stored) => {
					const bySession =
						typeof stored.globalRunningBySession === "object" &&
						stored.globalRunningBySession !== null
							? (stored.globalRunningBySession as Record<string, number>)
							: {};
					handler({ type: "globalRunningSessions", bySession });
				})
				.catch((err: unknown) => {
					reportWarn({
						code: "E_SW_STORAGE",
						source: "panel",
						message: "failed to read globalRunningBySession",
						cause: err,
					});
				});
		}

		this.requestGlobalRunningSnapshot();

		return () => {
			for (const cleanup of cleanups) cleanup();
		};
	}

	dispose(): void {
		const wid = this.windowId;
		if (wid !== null) {
			void this.sessionController.clearRunningSessionsForWindow(wid);
		}
		if (
			this.windowId === null ||
			typeof chrome === "undefined" ||
			!chrome.runtime
		) {
			return;
		}
		void sendMessageSafe(
			{ type: "panelUnregister", windowId: this.windowId },
			{ source: "panel", op: "panelUnregister" },
		);
	}
}
