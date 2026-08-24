import { useEffect, useRef, useState } from "preact/hooks";
import { EnrollmentController } from "../../controllers/enrollment-controller";
import { EnrollmentHost } from "../../controllers/enrollment-host";
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
import { getSkillService } from "../../skills/skill-service";
import { browsergentStore } from "../../state/store";
import { openPanelStorage } from "../../storage/open-panel-storage";
import type { StorageBackend } from "../../storage/storage-backend";
import { createAgentTools } from "../../worker/agent-tools";
import { connectBridgeClient } from "../bridge-client";
import { ExtensionJsClient } from "../extension-js-client";
import { handleFileOp } from "../file-op-handler";
import { getUrlTracker } from "../url-tracker";
import { WindowContextController } from "../window-context-controller";
import {
	bindFileTreeController,
	refreshShallowFileTree,
} from "./files/refresh-file-tree";

export interface AppInitResult {
	initialized: boolean;
	workerReady: boolean;
	windowId: number | null;
	/** Reactive — set as soon as storage is ready (before session hydrate). */
	settingsController: SettingsController | null;
	onRunningSessionsChangedRef: { current: (() => void) | null };
	supervisorRef: { current: RunSupervisor | null };
	extjsControllerRef: { current: ExtjsController | null };
	settingsControllerRef: { current: SettingsController | null };
	sessionControllerRef: { current: SessionController | null };
	filesControllerRef: { current: FilesController | null };
	windowContextRef: { current: WindowContextController | null };
	enrollmentToken: string | null;
	bridgeConnected: boolean;
	cliEnrolled: boolean;
	generateEnrollment: () => Promise<void>;
	revokeEnrollment: () => Promise<void>;
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
	const [settingsController, setSettingsController] =
		useState<SettingsController | null>(null);
	const supervisorRef = useRef<RunSupervisor | null>(null);
	const onRunningSessionsChangedRef = useRef<(() => void) | null>(null);
	const extjsControllerRef = useRef<ExtjsController | null>(null);
	/** Ref for non-React callers; kept in sync with settingsController state. */
	const settingsControllerRef = useRef<SettingsController | null>(null);
	const sessionControllerRef = useRef<SessionController | null>(null);
	const filesControllerRef = useRef<FilesController | null>(null);
	const windowContextRef = useRef<WindowContextController | null>(null);
	const enrollmentControllerRef = useRef<EnrollmentController | null>(null);
	const enrollmentHostRef = useRef<EnrollmentHost | null>(null);
	const [enrollmentToken, setEnrollmentToken] = useState<string | null>(null);
	const [bridgeConnected, setBridgeConnected] = useState(false);
	const [cliEnrolled, setCliEnrolled] = useState(false);
	const disconnectBridgeRef = useRef<(() => void) | null>(null);

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
			const bootStep = (step: string) => {
				// Sync DOM marker for multi-window diagnostics (survives hung awaits).
				try {
					document.documentElement.dataset.bootStep = step;
				} catch {
					/* ignore */
				}
			};
			bootStep("start");

			// --- IDB (durable only via openPanelStorage; serial queue inside) ---
			const swReject = (ms: number, label: string): Promise<never> => {
				const pageTimer = new Promise<never>((_, rej) => {
					setTimeout(
						() => rej(new Error(`${label} timeout after ${ms}ms`)),
						ms,
					);
				});
				if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
					return pageTimer;
				}
				const swTimer = chrome.runtime
					.sendMessage({ type: "swDelay", ms })
					.then(() => {
						throw new Error(`${label} timeout after ${ms}ms`);
					})
					.catch((err: unknown) => {
						if (err instanceof Error && err.message.includes("timeout after")) {
							throw err;
						}
						return pageTimer;
					});
				return Promise.race([swTimer, pageTimer]);
			};

			const idbStartedAt = Date.now();
			bootStep("idb-open");
			store.bootComponentSet("idb", "pending");

			let storage: StorageBackend;
			try {
				storage = await openPanelStorage();
				if (cancelled) {
					await storage.close();
					return;
				}
				storageRef = storage;
				store.bootComponentSet("idb", "ok");
				bootStep("idb-ok");
				console.info(
					`[browsergent][info] IndexedDB ready in ${Date.now() - idbStartedAt}ms`,
				);
			} catch (err) {
				reportError({
					code: "E_BOOT_IDB",
					source: "boot",
					message: "IndexedDB init failed",
					cause: err,
				});
				store.bootComponentSet("idb", "fail");
				store.bootHostErrorSet({
					code: "E_BOOT_IDB",
					message:
						err instanceof Error
							? err.message
							: "IndexedDB failed; cannot start durable storage",
					source: "boot",
				});
				bootStep("idb-fail");
				// No MemoryStorage stash — surface error and stop boot.
				if (!cancelled) {
					setInitialized(true);
					setWorkerReady(false);
				}
				return;
			}

			if (cancelled) return;

			// Settings first — independent of sessions store. Second-window panels
			// were stuck on "Loading settings…" when session init/listSessions
			// blocked before settingsCtrl existed or load() ran.
			bootStep("settings-load");
			const settingsCtrl = new SettingsController(storage);
			settingsControllerRef.current = settingsCtrl;
			if (!cancelled) setSettingsController(settingsCtrl);
			const enrollmentCtrl = new EnrollmentController(storage);
			enrollmentControllerRef.current = enrollmentCtrl;
			const existingToken = await enrollmentCtrl.current();
			if (!cancelled) setEnrollmentToken(existingToken);
			const previouslyEnrolled = await enrollmentCtrl.wasCliEnrolled();
			if (!cancelled && previouslyEnrolled) setCliEnrolled(true);
			// Optimistic loaded=true so Settings UI is never stuck if IDB get hangs
			// under multi-window contention (B8). Real values overwrite when load completes.
			browsergentStore.getState().settingsLoaded({
				providers: browsergentStore.getState().settings.providers,
				activeProviderId: browsergentStore.getState().settings.activeProviderId,
				loaded: true,
			});
			const settingsLoadPromise = settingsCtrl.load().catch((err: unknown) => {
				reportWarn({
					code: "E_HOST_UNKNOWN",
					source: "boot",
					message: "Settings load failed",
					cause: err,
				});
			});
			bootStep("settings-started");

			const sessionCtrl = new SessionController(storage);
			sessionControllerRef.current = sessionCtrl;
			// Meta-only refresh — await briefly so resolveOrCreate sees panelActive (B1).
			bootStep("session-init");
			try {
				const initP = sessionCtrl.init();
				const pageTimeout = new Promise<never>((_, rej) => {
					setTimeout(
						() => rej(new Error("SessionController.init timeout")),
						3_000,
					);
				});
				const swTimeout =
					typeof chrome !== "undefined" && chrome.runtime?.sendMessage
						? chrome.runtime
								.sendMessage({ type: "swDelay", ms: 3_000 })
								.then(() => {
									throw new Error("SessionController.init timeout");
								})
								.catch(() => pageTimeout)
						: pageTimeout;
				await Promise.race([initP, swTimeout, pageTimeout]);
				bootStep("session-ok");
			} catch (err: unknown) {
				bootStep("session-fail");
				reportError({
					code: "E_BOOT_SESSION",
					source: "boot",
					message: "SessionController.init failed",
					cause: err,
				});
			}
			void settingsLoadPromise;

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
							.then(async (result) => {
								supervisor.postRelay(msg.id, {
									type: "fileOpResult",
									id: msg.id,
									result,
								});
								// Mutating tools must refresh Files tree / preview (upload path
								// already did; agent file_edit/delete/write previously left UI stale).
								if (
									result.op === "edit" ||
									result.op === "write" ||
									result.op === "delete"
								) {
									browsergentStore.getState().incrementFilesVersion();
									try {
										await refreshShallowFileTree(filesCtrl);
									} catch {
										/* best-effort UI refresh */
									}
								}
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

			const windowCtx = new WindowContextController(sessionCtrl);
			windowContextRef.current = windowCtx;

			const filesCtrl = new FilesController(ExtensionJsClient.getInstance());
			filesControllerRef.current = filesCtrl;
			bindFileTreeController(filesCtrl);
			const ensureActingHost = async (): Promise<void> => {
				const wid = windowContextRef.current?.getWindowId();
				await extjs.init(
					typeof wid === "number" && wid > 0
						? { windowId: wid }
						: undefined,
				);
			};
			const enrollmentHost = new EnrollmentHost({
				enrollment: enrollmentCtrl,
				sessions: sessionCtrl,
				onCliEnrolled: (enrolled) => {
					if (!cancelled) setCliEnrolled(enrolled);
				},
				tools: createAgentTools(
					async (code) => {
						await ensureActingHost();
						return ExtensionJsClient.getInstance().runJs(code);
					},
					async (format) => {
						await ensureActingHost();
						return ExtensionJsClient.getInstance().getApiDocs(format);
					},
					(skill, path) => getSkillService().loadSkill(skill, path),
					async (op) => {
						await ensureActingHost();
						return handleFileOp({ id: "bridge", op }, filesCtrl);
					},
				),
				runtime: {
					reset: async () => {
						await ensureActingHost();
						await ExtensionJsClient.getInstance().reset();
					},
					stop: async () => {
						await ensureActingHost();
						await ExtensionJsClient.getInstance().stop();
					},
				},
			});
			enrollmentHostRef.current = enrollmentHost;
			void enrollmentHost.restoreCliEnrollment();

			// Acting (extension-js) and agent-worker start on first Run / first OPFS need — not on boot.
			// Window bind then shell paint; never block paint more than a few seconds.
			const paintShell = (
				sessionId: string,
				wid: number,
				step: string,
			): void => {
				if (cancelled) return;
				if (wid > 0) {
					setWindowId(wid);
					browsergentStore.getState().bootWindowIdSet(wid);
					ExtensionJsClient.getInstance().bindWindowId(wid);
				}
				browsergentStore.getState().bootComponentSet("sw", "ok");
				try {
					supervisor.startForeground(sessionId);
					setWorkerReady(true);
					browsergentStore.getState().bootComponentSet("worker", "ok");
					browsergentStore.getState().bootComponentSet("extjs", "pending");
				} catch (err) {
					reportError({
						code: "E_BOOT_WORKER",
						source: "boot",
						message: "Failed to bind foreground session",
						cause: err,
					});
					browsergentStore.getState().bootComponentSet("worker", "fail");
					// Still paint shell so the user sees errors / can use Settings.
					setWorkerReady(true);
				}
				browsergentStore.getState().activeSessionChanged(sessionId);
				setInitialized(true);
				disconnectBridgeRef.current?.();
				disconnectBridgeRef.current = connectBridgeClient({
					handle: (request) => enrollmentHost.handle(request),
					onOpen: () => {
						if (!cancelled) setBridgeConnected(true);
					},
					onClose: () => {
						if (!cancelled) setBridgeConnected(false);
					},
				});
				bootStep(step);
				// Out-of-band ready marker — Playwright can poll this via the service
				// worker when page.evaluate on the extension document is frozen (CDP).
				if (
					typeof chrome !== "undefined" &&
					chrome.storage?.session?.set &&
					wid > 0
				) {
					void chrome.storage.session
						.set({
							[`panelReady:${wid}`]: {
								ts: Date.now(),
								sessionId,
								step,
								idb: browsergentStore.getState().boot.idb,
							},
						})
						.catch(() => {
							/* ok */
						});
				}
			};

			const parseQueryWindowId = (): number => {
				try {
					const raw = new URLSearchParams(location.search).get("windowId");
					const n = raw ? Number(raw) : 0;
					return Number.isFinite(n) && n > 0 ? n : 0;
				} catch {
					return 0;
				}
			};

			try {
				bootStep("window-init");
				const rebindSession = (nextId: string, nextWid: number) => {
					if (cancelled) return;
					supervisor.setForegroundSession(nextId);
					supervisor.startForeground(nextId);
					browsergentStore.getState().activeSessionChanged(nextId);
					if (nextWid > 0) {
						setWindowId(nextWid);
						browsergentStore.getState().bootWindowIdSet(nextWid);
					}
					void sessionCtrl.loadForSession(nextId).then((session) => {
						if (cancelled || !session) return;
						browsergentStore.getState().hydrateChat(session.messages);
						browsergentStore.getState().hydrateTrace(session.trace);
						browsergentStore.getState().hydrateDiagnostics(session.diagnostics);
					});
				};

				let wid = 0;
				let sessionId = "";

				// Durable path: bounded window attach (ephemeral only if attach times out).
				const WINDOW_INIT_MS = 4_000;
				try {
					const attached = await Promise.race([
						windowCtx.init({ onSessionResolved: rebindSession }),
						swReject(WINDOW_INIT_MS, "windowCtx.init"),
					]);
					wid = attached.windowId;
					sessionId = attached.sessionId;
					bootStep("window-ok");
				} catch (winErr: unknown) {
					reportError({
						code: "E_BOOT_WINDOW",
						source: "boot",
						message: "windowCtx.init timed out or failed; ephemeral attach",
						cause: winErr,
					});
					wid = parseQueryWindowId();
					if (wid > 0) {
						sessionCtrl.bindPanelWindow(wid);
					}
					sessionId = sessionCtrl.adoptEphemeralSession(wid);
					// Best-effort durable write so multi-window list/merge can see this session.
					void sessionCtrl.persistEphemeralSession(wid, sessionId).catch(() => {
						/* ok */
					});
					bootStep("window-ephemeral");
				}
				paintShell(sessionId, wid, "shell-ready");
				sessionCtrl.scheduleIdleTrim();

				// Background body hydrate + session list (never blocks shell).
				void (async () => {
					try {
						await settingsLoadPromise;
						if (cancelled) return;
						const session = await sessionCtrl.loadForSession(sessionId);
						if (cancelled) return;
						if (session) {
							browsergentStore.getState().hydrateChat(session.messages);
							browsergentStore.getState().hydrateTrace(session.trace);
							browsergentStore
								.getState()
								.hydrateDiagnostics(session.diagnostics);
						}
						sessionCtrl.hydrated = true;
						const { sessions: sessionList } = await sessionCtrl.listSessions(
							wid > 0 ? wid : undefined,
						);
						if (cancelled) return;
						browsergentStore.getState().sessionListLoaded(sessionList);
						bootStep("hydrate-ok");
					} catch (hydrateErr: unknown) {
						sessionCtrl.hydrated = true;
						reportWarn({
							code: "E_BOOT_SESSION",
							source: "boot",
							message: "background session hydrate failed",
							cause: hydrateErr,
						});
						bootStep("hydrate-fail");
					}
				})();
			} catch (err: unknown) {
				reportError({
					code: "E_BOOT_SESSION",
					source: "boot",
					message: "Session load / window init failed",
					cause: err,
				});
				sessionCtrl.hydrated = true;
				let wid = windowCtx.getWindowId() ?? 0;
				if (wid <= 0) {
					try {
						const raw = new URLSearchParams(location.search).get("windowId");
						const n = raw ? Number(raw) : 0;
						wid = Number.isFinite(n) && n > 0 ? n : 0;
					} catch {
						wid = 0;
					}
				}
				if (wid > 0) {
					sessionCtrl.bindPanelWindow(wid);
				}
				const activeSessionId =
					sessionCtrl.getActiveSessionId() ??
					sessionCtrl.adoptEphemeralSession(wid);
				paintShell(activeSessionId, wid, "shell-ready-recovery");
				sessionCtrl.scheduleIdleTrim();
				void sessionCtrl
					.listSessions(wid > 0 ? wid : undefined)
					.then(({ sessions: sessionList }) => {
						if (cancelled) return;
						browsergentStore.getState().sessionListLoaded(sessionList);
					})
					.catch(() => {
						/* ok */
					});
			}
		}

		void init();

		return () => {
			cancelled = true;
			disconnectBridgeRef.current?.();
			disconnectBridgeRef.current = null;
			bindFileTreeController(null);
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

	const generateEnrollment = async (): Promise<void> => {
		try {
			const token =
				(await enrollmentHostRef.current?.generate()) ??
				(await enrollmentControllerRef.current?.generate());
			if (token !== undefined) setEnrollmentToken(token);
		} catch (err: unknown) {
			reportWarn({
				code: "E_HOST_UNKNOWN",
				source: "panel",
				message: "Failed to generate enrollment token",
				cause: err,
			});
		}
	};

	const revokeEnrollment = async (): Promise<void> => {
		try {
			if (enrollmentHostRef.current) {
				await enrollmentHostRef.current.revoke();
			} else {
				await enrollmentControllerRef.current?.revoke();
			}
			setEnrollmentToken(null);
			setCliEnrolled(false);
		} catch (err: unknown) {
			reportWarn({
				code: "E_HOST_UNKNOWN",
				source: "panel",
				message: "Failed to revoke enrollment token",
				cause: err,
			});
		}
	};

	return {
		initialized,
		workerReady,
		windowId,
		settingsController,
		onRunningSessionsChangedRef,
		supervisorRef,
		extjsControllerRef,
		settingsControllerRef,
		sessionControllerRef,
		filesControllerRef,
		windowContextRef,
		enrollmentToken,
		bridgeConnected,
		cliEnrolled,
		generateEnrollment,
		revokeEnrollment,
	};
}
