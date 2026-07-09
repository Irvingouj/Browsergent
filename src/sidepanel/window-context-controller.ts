import type { SessionController } from "../controllers/session-controller";
import {
	reportError,
	reportWarn,
	sendMessageSafe,
} from "../errors/report";
import {
	isGlobalRunningSessionsMessage,
	isWindowLifecycleMessage,
	type GlobalRunningSessionsMessage,
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

export async function getCurrentWindowId(): Promise<number> {
	if (typeof chrome === "undefined" || !chrome.windows?.getCurrent) {
		return 0;
	}
	const w = await chrome.windows.getCurrent();
	if (typeof w.id !== "number") {
		return 0;
	}
	return w.id;
}

export class WindowContextController {
	private windowId: number | null = null;

	constructor(private readonly sessionController: SessionController) {}

	getWindowId(): number | null {
		return this.windowId;
	}

	async init(): Promise<{ windowId: number; sessionId: string }> {
		const windowId = await getCurrentWindowId();
		this.windowId = windowId;
		if (windowId <= 0) {
			reportWarn({
				code: "E_BOOT_WINDOW",
				source: "boot",
				message:
					"windows.getCurrent returned no id; tab ownership isolation may be disabled",
				details: { windowId },
			});
		}
		const sessionId =
			await this.sessionController.resolveOrCreateForWindow(windowId);

		if (typeof chrome !== "undefined" && chrome.runtime) {
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
				const { emittedAt: _emittedAt, ...lifecycle } = change.newValue as
					WindowLifecycleMessage & { emittedAt?: number };
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
