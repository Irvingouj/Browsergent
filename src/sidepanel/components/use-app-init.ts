import { useEffect, useRef, useState } from "preact/hooks";
import { ExtjsController } from "../../controllers/extjs-controller";
import { FilesController } from "../../controllers/files";
import { RunSupervisor } from "../../controllers/run-supervisor";
import { SessionController } from "../../controllers/session-controller";
import { SettingsController } from "../../controllers/settings-controller";
import {
	formatDiagSnapshot,
	getMemoryDiagRing,
	installGlobalErrorHandlers,
	onDiagnosticReport,
	readDiagRingFromSession,
	reportError,
	reportWarn,
	sendMessageSafe,
} from "../../errors/report";
import {
	isOffscreenPanelRelayMessage,
	isOffscreenRunEventMessage,
	isSessionRunRelayMessage,
	type OffscreenRunStateMessage,
} from "../../protocol/offscreen-run";
import { browsergentStore } from "../../state/store";
import { IndexedDBStorage } from "../../storage/indexeddb-storage";
import { MemoryStorage } from "../../storage/memory-storage";
import { migrateFromChromeStorage } from "../../storage/migrate";
import type { StorageBackend } from "../../storage/storage-backend";
import { ExtensionJsClient } from "../extension-js-client";
import { handleFileOp } from "../file-op-handler";
import { getUrlTracker } from "../url-tracker";
import { WindowContextController } from "../window-context-controller";

export interface AppInitResult {
	initialized: boolean;
	workerReady: boolean;
	windowId: number | null;
	onRunningSessionsChangedRef: { current: (() => void) | null };
	supervisorRef: { current: RunSupervisor | null };
	extjsControllerRef: { current: ExtjsController | null };
	settingsControllerRef: { current: SettingsController | null };
	sessionControllerRef: { current: SessionController | null };
	filesControllerRef: { current: FilesController | null };
	windowContextRef: { current: WindowContextController | null };
}

function attachDiagGlobals(): void {
	const w = window as Window & {
		__BROWSERGENT_DIAG__?: {
			memory: ReturnType<typeof getMemoryDiagRing>;
			snapshot: () => string;
			swRing?: unknown;
		};
	};
	w.__BROWSERGENT_DIAG__ = {
		get memory() {
			return getMemoryDiagRing();
		},
		snapshot: () => formatDiagSnapshot(getMemoryDiagRing()),
	};
	void readDiagRingFromSession().then((ring) => {
		if (w.__BROWSERGENT_DIAG__) {
			w.__BROWSERGENT_DIAG__.swRing = ring;
			if (ring.length > 0) {
				console.warn(
					`[browsergent][info] loaded ${ring.length} SW diag ring entries — window.__BROWSERGENT_DIAG__.swRing`,
				);
			}
		}
	});
}

export function useAppInit(): AppInitResult {
	const [initialized, setInitialized] = useState(false);
	const [workerReady, setWorkerReady] = useState(false);
	const [windowId, setWindowId] = useState<number | null>(null);
	const supervisorRef = useRef<RunSupervisor | null>(null);
	const onRunningSessionsChangedRef = useRef<(() => void) | null>(null);
	const extjsControllerRef = useRef<ExtjsController | null>(null);
	const settingsControllerRef = useRef<SettingsController | null>(null);
	const sessionControllerRef = useRef<SessionController | null>(null);
	const filesControllerRef = useRef<FilesController | null>(null);
	const windowContextRef = useRef<WindowContextController | null>(null);

	useEffect(() => {
		installGlobalErrorHandlers("panel");
		attachDiagGlobals();
		const unsub = onDiagnosticReport((report) => {
			if (report.level !== "error") return;
			browsergentStore.getState().bootHostErrorSet({
				code: String(report.code),
				message: report.message,
				source: report.source,
				ts: report.ts,
			});
		});
		return unsub;
	}, []);

	useEffect(() => {
		let cancelled = false;
		let storageRef: StorageBackend | null = null;

		async function init() {
			const store = browsergentStore.getState();

			// --- IDB ---
			try {
				const storage = new IndexedDBStorage();
				await storage.init();
				if (cancelled) {
					storage.close();
					return;
				}
				await migrateFromChromeStorage(storage);
				if (cancelled) {
					storage.close();
					return;
				}
				storageRef = storage;
				store.bootComponentSet("idb", "ok");
			} catch (err) {
				reportError({
					code: "E_BOOT_IDB",
					source: "boot",
					message: "IndexedDB init failed; falling back to memory storage",
					cause: err,
				});
				store.bootComponentSet("idb", "degraded");
				store.bootHostErrorSet({
					code: "E_BOOT_IDB",
					message:
						err instanceof Error
							? err.message
							: "IndexedDB failed; using memory storage (sessions not persisted)",
					source: "boot",
				});
				storageRef = new MemoryStorage();
				if (cancelled) return;
			}

			if (cancelled) return;

			const storage = storageRef;

			const sessionCtrl = new SessionController(storage);
			sessionControllerRef.current = sessionCtrl;
			try {
				await sessionCtrl.init();
			} catch (err) {
				reportError({
					code: "E_BOOT_SESSION",
					source: "boot",
					message: "SessionController.init failed",
					cause: err,
				});
			}

			const supervisor = new RunSupervisor(
				sessionCtrl,
				{
					onRunningSessionsChanged: () => {
						onRunningSessionsChangedRef.current?.();
					},
					onExtjsRunRequest: (msg, _sessionId) => {
						extjsControllerRef.current?.handleRelayRequest(msg);
					},
					onExtjsDocsRequest: (msg, _sessionId) => {
						extjsControllerRef.current?.handleDocsRelayRequest(msg);
					},
					onLoadSkillRequest: (msg, _sessionId) => {
						extjsControllerRef.current?.handleLoadSkillRelayRequest(msg);
					},
					onFileOpRequest: (msg) => {
						const filesCtrl = filesControllerRef.current;
						if (!filesCtrl) {
							supervisor.postRelay(msg.id, {
								type: "fileOpError",
								id: msg.id,
								error: "Files controller unavailable",
							});
							return;
						}
						handleFileOp(msg, filesCtrl)
							.then((result) => {
								supervisor.postRelay(msg.id, {
									type: "fileOpResult",
									id: msg.id,
									result,
								});
							})
							.catch((err: unknown) => {
								const message =
									err instanceof Error ? err.message : String(err);
								reportWarn({
									code: "E_HOST_UNKNOWN",
									source: "panel",
									message: `fileOp failed: ${message}`,
									details: { requestId: msg.id },
									cause: err,
								});
								supervisor.postRelay(msg.id, {
									type: "fileOpError",
									id: msg.id,
									error: message,
								});
							});
					},
					onWorkerReady: (_sessionId) => {
						setWorkerReady(true);
						browsergentStore.getState().bootComponentSet("worker", "ok");
					},
					onAgentStopped: () => {
						extjsControllerRef.current?.stop().catch((err: unknown) => {
							reportWarn({
								code: "E_BOOT_EXTJS",
								source: "extjs",
								message: "JS stop on agent stopped failed",
								cause: err,
							});
						});
					},
					onSessionRunRelay: (sessionId, event) => {
						if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
							return;
						}
						void sendMessageSafe(
							{
								type: "sessionRunRelay",
								sessionId,
								event,
							},
							{ source: "relay", op: "sessionRunRelay" },
						);
					},
				},
				{
					// Panel-local workers: close side panel → runs stop (product intent).
					// In-panel multi-session concurrency is fine while the panel stays open.
					hosting: "local",
					getWindowId: () => windowContextRef.current?.getWindowId() ?? null,
				},
			);
			supervisorRef.current = supervisor;

			const extjs = new ExtjsController((msg) => {
				const id =
					typeof msg === "object" &&
					msg !== null &&
					"id" in msg &&
					typeof msg.id === "string"
						? msg.id
						: undefined;
				supervisor.postRelay(id, msg);
			});
			extjsControllerRef.current = extjs;

			const settingsCtrl = new SettingsController(storage);
			settingsControllerRef.current = settingsCtrl;

			const windowCtx = new WindowContextController(sessionCtrl);
			windowContextRef.current = windowCtx;

			const filesCtrl = new FilesController(ExtensionJsClient.getInstance());
			filesControllerRef.current = filesCtrl;

			const startExtjs = (wid: number | null | undefined) => {
				const opts =
					typeof wid === "number" && wid > 0 ? { windowId: wid } : undefined;
				if (!opts) {
					reportWarn({
						code: "E_BOOT_WINDOW",
						source: "boot",
						message:
							"extjs init without windowId — per-window tab ownership disabled",
						details: { windowId: wid ?? null },
					});
				}
				extjs
					.init(opts)
					.then(() => {
						browsergentStore.getState().bootComponentSet("extjs", "ok");
					})
					.catch((err: unknown) => {
						reportError({
							code: "E_BOOT_EXTJS",
							source: "boot",
							message: "Extension-js init failed",
							cause: err,
						});
						browsergentStore.getState().bootComponentSet("extjs", "fail");
					});
			};

			try {
				const { windowId: wid, sessionId } = await windowCtx.init();
				if (!cancelled) {
					setWindowId(wid);
					browsergentStore.getState().bootWindowIdSet(wid);
					browsergentStore.getState().bootComponentSet("sw", "ok");
				}
				startExtjs(wid);
				try {
					supervisor.startForeground(sessionId);
					browsergentStore.getState().bootComponentSet("worker", "pending");
				} catch (err) {
					reportError({
						code: "E_BOOT_WORKER",
						source: "boot",
						message: "Failed to start agent worker",
						cause: err,
					});
					browsergentStore.getState().bootComponentSet("worker", "fail");
				}
				const session = await sessionCtrl.loadForSession(sessionId);
				if (session) {
					browsergentStore.getState().hydrateChat(session.messages);
					browsergentStore.getState().hydrateTrace(session.trace);
					browsergentStore.getState().hydrateDiagnostics(session.diagnostics);
					const nodes = await filesCtrl.listAllFiles();
					browsergentStore.getState().setFileNodes(nodes);
				}
				sessionCtrl.hydrated = true;
				const { sessions: sessionList } = await sessionCtrl.listSessions(wid);
				browsergentStore.getState().sessionListLoaded(sessionList);
				browsergentStore.getState().activeSessionChanged(sessionId);
			} catch (err: unknown) {
				reportError({
					code: "E_BOOT_SESSION",
					source: "boot",
					message: "Session load / window init failed",
					cause: err,
				});
				sessionCtrl.hydrated = true;
				const activeSessionId = sessionCtrl.getActiveSessionId() ?? "";
				try {
					const nodes = await filesCtrl.listAllFiles();
					browsergentStore.getState().setFileNodes(nodes);
				} catch (filesErr) {
					reportWarn({
						code: "E_HOST_UNKNOWN",
						source: "boot",
						message: "listAllFiles during boot recovery failed",
						cause: filesErr,
					});
				}
				const wid = windowCtx.getWindowId();
				if (wid !== null) {
					browsergentStore.getState().bootWindowIdSet(wid);
				}
				startExtjs(wid);
				if (activeSessionId) {
					try {
						supervisor.startForeground(activeSessionId);
					} catch (workerErr) {
						reportError({
							code: "E_BOOT_WORKER",
							source: "boot",
							message: "Failed to start agent worker (recovery path)",
							cause: workerErr,
						});
						browsergentStore.getState().bootComponentSet("worker", "fail");
					}
				}
				const { sessions: sessionList } = await sessionCtrl.listSessions(
					wid ?? undefined,
				);
				browsergentStore.getState().sessionListLoaded(sessionList);
				browsergentStore.getState().activeSessionChanged(activeSessionId);
			}

			settingsCtrl.load().catch((err: unknown) => {
				reportWarn({
					code: "E_HOST_UNKNOWN",
					source: "boot",
					message: "Settings load failed",
					cause: err,
				});
			});

			setInitialized(true);
		}

		void init();

		return () => {
			cancelled = true;
			windowContextRef.current?.dispose();
			supervisorRef.current?.dispose();
			supervisorRef.current = null;
			const extjs = extjsControllerRef.current;
			if (extjs) {
				extjs.dispose().catch((err: unknown) => {
					reportWarn({
						code: "E_BOOT_EXTJS",
						source: "extjs",
						message: "JS dispose failed",
						cause: err,
					});
				});
			}
			sessionControllerRef.current?.cancelPendingSave();
			void storageRef?.close();
		};
	}, []);

	// Subscribe to offscreen run events and panel relay requests.
	useEffect(() => {
		if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;

		const listener = (
			message: unknown,
			_sender: chrome.runtime.MessageSender,
			sendResponse: (response?: unknown) => void,
		) => {
			try {
				const supervisor = supervisorRef.current;
				const windowCtx = windowContextRef.current;
				const panelWindowId = windowCtx?.getWindowId();

				if (isOffscreenRunEventMessage(message) && supervisor) {
					supervisor.applyRemoteRunEvent(message.sessionId, message.event);
					return;
				}

				if (isSessionRunRelayMessage(message) && supervisor) {
					if (!supervisor.isLocalWorkerHost(message.sessionId)) {
						supervisor.applyRemoteRunEvent(message.sessionId, message.event);
					}
					return;
				}

				const stateMsg = message as OffscreenRunStateMessage;
				if (
					stateMsg?.type === "offscreenRunState" &&
					Array.isArray(stateMsg.runs) &&
					supervisor &&
					panelWindowId !== null &&
					panelWindowId !== undefined
				) {
					for (const run of stateMsg.runs) {
						if (run.windowId !== panelWindowId) continue;
						supervisor.adoptRemoteRun(run.sessionId, run.runId, run.status);
					}
					return;
				}

				if (isOffscreenPanelRelayMessage(message)) {
					if (panelWindowId !== message.windowId) return;
					const extjs = extjsControllerRef.current;
					const filesCtrl = filesControllerRef.current;
					const respond = (
						response: import("../../types/messages").PanelToWorker,
					) => {
						void sendMessageSafe(
							{
								type: "offscreenPanelRelayResponse",
								requestId: message.requestId,
								message: response,
							},
							{ source: "relay", op: "offscreenPanelRelayResponse" },
						);
					};

					if (message.message.type === "extjsRunRequest" && extjs) {
						extjs.handleRelayRequest(message.message);
						const prior = ExtensionJsClient.relayCallback;
						ExtensionJsClient.relayCallback = (relayMsg) => {
							respond(relayMsg);
							ExtensionJsClient.relayCallback = prior;
						};
						sendResponse({ ok: true });
						return true;
					}
					if (message.message.type === "extjsDocsRequest" && extjs) {
						extjs.handleDocsRelayRequest(message.message);
						const prior = ExtensionJsClient.relayCallback;
						ExtensionJsClient.relayCallback = (relayMsg) => {
							respond(relayMsg);
							ExtensionJsClient.relayCallback = prior;
						};
						sendResponse({ ok: true });
						return true;
					}
					if (message.message.type === "fileOpRequest" && filesCtrl) {
						handleFileOp(message.message, filesCtrl)
							.then((result) => {
								respond({
									type: "fileOpResult",
									id: message.requestId,
									result,
								});
							})
							.catch((err: unknown) => {
								respond({
									type: "fileOpError",
									id: message.requestId,
									error: err instanceof Error ? err.message : String(err),
								});
							});
						sendResponse({ ok: true });
						return true;
					}
				}
			} catch (err) {
				reportError({
					code: "E_RELAY_PARSE",
					source: "relay",
					message: "panel runtime message handler failed",
					cause: err,
				});
			}
		};

		chrome.runtime.onMessage.addListener(listener);
		return () => {
			chrome.runtime.onMessage.removeListener(listener);
		};
	}, [supervisorRef, windowContextRef, extjsControllerRef, filesControllerRef]);

	useEffect(() => {
		if (typeof chrome === "undefined" || !chrome.storage?.session?.onChanged) {
			return;
		}
		const listener = (
			changes: { [key: string]: chrome.storage.StorageChange },
			areaName?: string,
		) => {
			try {
				if (areaName !== undefined && areaName !== "session") return;
				const supervisor = supervisorRef.current;
				if (!supervisor) return;
				for (const [key, change] of Object.entries(changes)) {
					if (!key.startsWith("runRelay:") || !change?.newValue) continue;
					const sessionId = key.slice("runRelay:".length);
					const payload = change.newValue as {
						event?: import("../../types/messages").WorkerToPanel;
					};
					if (payload.event && !supervisor.isLocalWorkerHost(sessionId)) {
						supervisor.applyRemoteRunEvent(sessionId, payload.event);
					}
				}
			} catch (err) {
				reportError({
					code: "E_RELAY_PARSE",
					source: "relay",
					message: "runRelay storage handler failed",
					cause: err,
				});
			}
		};
		chrome.storage.session.onChanged.addListener(listener);
		return () => {
			chrome.storage.session.onChanged.removeListener(listener);
		};
	}, [supervisorRef]);

	// Wire tab activation + main-frame navigations to UrlTracker (active tab only).
	useEffect(() => {
		const tracker = getUrlTracker();
		let activeTabId: number | null = null;

		const applyActiveTab = (tabId: number, url?: string) => {
			activeTabId = tabId;
			if (url) tracker.onNavigate(url);
		};

		if (typeof chrome !== "undefined" && chrome.tabs?.query) {
			chrome.tabs
				.query({ active: true, currentWindow: true })
				.then((tabs) => {
					const tab = tabs[0];
					if (tab?.id !== undefined) {
						applyActiveTab(tab.id, tab.url);
					}
				})
				.catch((err: unknown) => {
					reportWarn({
						code: "E_HOST_UNKNOWN",
						source: "panel",
						message: "initial active tab query failed",
						cause: err,
					});
				});
		}

		const cleanups: Array<() => void> = [];

		if (typeof chrome !== "undefined" && chrome.tabs?.onActivated) {
			const onActivated = (info: chrome.tabs.TabActiveInfo) => {
				chrome.tabs.get(info.tabId, (tab) => {
					applyActiveTab(info.tabId, tab?.url);
				});
			};
			chrome.tabs.onActivated.addListener(onActivated);
			cleanups.push(() => {
				chrome.tabs.onActivated.removeListener(onActivated);
			});
		}

		if (typeof chrome !== "undefined" && chrome.webNavigation?.onCommitted) {
			const handler = (
				details: chrome.webNavigation.WebNavigationTransitionCallbackDetails,
			) => {
				if (details.frameId !== 0) return;
				if (activeTabId !== null && details.tabId !== activeTabId) return;
				tracker.onNavigate(details.url);
			};
			chrome.webNavigation.onCommitted.addListener(handler);
			cleanups.push(() => {
				chrome.webNavigation.onCommitted.removeListener(handler);
			});
		}

		return () => {
			for (const cleanup of cleanups) cleanup();
		};
	}, []);

	return {
		initialized,
		workerReady,
		windowId,
		onRunningSessionsChangedRef,
		supervisorRef,
		extjsControllerRef,
		settingsControllerRef,
		sessionControllerRef,
		filesControllerRef,
		windowContextRef,
	};
}
