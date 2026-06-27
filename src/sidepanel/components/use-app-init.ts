import { useEffect, useRef, useState } from "preact/hooks";
import { ExtjsController } from "../../controllers/extjs-controller";
import { FilesController } from "../../controllers/files-controller";
import { SessionController } from "../../controllers/session-controller";
import { SettingsController } from "../../controllers/settings-controller";
import { WorkerBridge } from "../../controllers/worker-bridge";
import { browsergentStore } from "../../state/store";
import { IndexedDBStorage } from "../../storage/indexeddb-storage";
import { MemoryStorage } from "../../storage/memory-storage";
import {
	migrateFromChromeStorage,
	migrateLegacySingleProvider,
} from "../../storage/migrate";
import type { StorageBackend } from "../../storage/storage-backend";
import { ExtensionJsClient } from "../extension-js-client";
import { handleFileOp } from "../file-op-handler";
import { getUrlTracker } from "../url-tracker";

export interface AppInitResult {
	initialized: boolean;
	workerReady: boolean;
	bridgeRef: { current: WorkerBridge | null };
	extjsControllerRef: { current: ExtjsController | null };
	settingsControllerRef: { current: SettingsController | null };
	sessionControllerRef: { current: SessionController | null };
	filesControllerRef: { current: FilesController | null };
}

export function useAppInit(): AppInitResult {
	const [initialized, setInitialized] = useState(false);
	const [workerReady, setWorkerReady] = useState(false);
	const bridgeRef = useRef<WorkerBridge | null>(null);
	const extjsControllerRef = useRef<ExtjsController | null>(null);
	const settingsControllerRef = useRef<SettingsController | null>(null);
	const sessionControllerRef = useRef<SessionController | null>(null);
	const filesControllerRef = useRef<FilesController | null>(null);

	useEffect(() => {
		let cancelled = false;
		let storageRef: StorageBackend | null = null;

		async function init() {
			try {
				const storage = new IndexedDBStorage();
				await storage.init();
				if (cancelled) {
					storage.close();
					return;
				}
				await migrateFromChromeStorage(storage);
				await migrateLegacySingleProvider(storage);
				if (cancelled) {
					storage.close();
					return;
				}
				storageRef = storage;
			} catch (err) {
				console.warn("Storage init failed, using memory fallback:", err);
				storageRef = new MemoryStorage();
				if (cancelled) return;
			}

			if (cancelled) return;

			const storage = storageRef;

			const bridge = new WorkerBridge({
				onExtjsRunRequest: (msg) => {
					extjsControllerRef.current?.handleRelayRequest(msg);
				},
				onExtjsDocsRequest: (msg) => {
					extjsControllerRef.current?.handleDocsRelayRequest(msg);
				},
				onLoadSkillRequest: (msg) => {
					extjsControllerRef.current?.handleLoadSkillRelayRequest(msg);
				},
				onFileOpRequest: (msg) => {
					const filesCtrl = filesControllerRef.current;
					const bridgeInstance = bridgeRef.current;
					if (!filesCtrl || !bridgeInstance) {
						bridgeInstance?.post({
							type: "fileOpError",
							id: msg.id,
							error: "Files controller unavailable",
						});
						return;
					}
					handleFileOp(msg, filesCtrl)
						.then((result) => {
							bridgeRef.current?.post({
								type: "fileOpResult",
								id: msg.id,
								result,
							});
						})
						.catch((err: unknown) => {
							const message = err instanceof Error ? err.message : String(err);
							bridgeRef.current?.post({
								type: "fileOpError",
								id: msg.id,
								error: message,
							});
						});
				},
				onWorkerReady: () => setWorkerReady(true),
				onAgentStopped: () => {
					extjsControllerRef.current?.stop().catch((err: unknown) => {
						console.warn("JS stop on agent stopped failed:", err);
					});
				},
			});
			bridgeRef.current = bridge;

			const extjs = new ExtjsController(bridge);
			extjsControllerRef.current = extjs;

			const settingsCtrl = new SettingsController(storage);
			settingsControllerRef.current = settingsCtrl;

			const sessionCtrl = new SessionController(storage);
			sessionControllerRef.current = sessionCtrl;
			await sessionCtrl.init();

			const filesCtrl = new FilesController(ExtensionJsClient.getInstance());
			filesControllerRef.current = filesCtrl;

			extjs.init().catch((err: unknown) => {
				console.warn("JS init failed:", err);
			});
			bridge.start();
			sessionCtrl
				.load()
				.then(async (session) => {
					if (session) {
						const _activeSessionId = sessionCtrl.getActiveSessionId() ?? "";
						browsergentStore.getState().hydrateChat(session.messages);
						browsergentStore.getState().hydrateTrace(session.trace);
						browsergentStore.getState().hydrateDiagnostics(session.diagnostics);
						const nodes = await filesCtrl.listAllFiles();
						browsergentStore.getState().setFileNodes(nodes);
					}
					sessionCtrl.hydrated = true;
					const { sessions: sessionList } = await sessionCtrl.listSessions();
					browsergentStore.getState().sessionListLoaded(sessionList);
					browsergentStore
						.getState()
						.activeSessionChanged(sessionCtrl.getActiveSessionId() || "");
				})
				.catch(async (err: unknown) => {
					console.warn("Session load failed:", err);
					sessionCtrl.hydrated = true;
					const activeSessionId = sessionCtrl.getActiveSessionId() ?? "";
					const nodes = await filesCtrl.listAllFiles();
					browsergentStore.getState().setFileNodes(nodes);
					const { sessions: sessionList } = await sessionCtrl.listSessions();
					browsergentStore.getState().sessionListLoaded(sessionList);
					browsergentStore.getState().activeSessionChanged(activeSessionId);
				});

			settingsCtrl.load().catch((err: unknown) => {
				console.warn("Settings load failed:", err);
			});

			setInitialized(true);
		}

		void init();

		return () => {
			cancelled = true;
			bridgeRef.current?.stop();
			const extjs = extjsControllerRef.current;
			if (extjs) {
				extjs.dispose().catch((err: unknown) => {
					console.warn("JS dispose failed:", err);
				});
			}
			sessionControllerRef.current?.cancelPendingSave();
			void storageRef?.close();
		};
	}, []);

	// Wire chrome.webNavigation.onCommitted to UrlTracker.
	useEffect(() => {
		const tracker = getUrlTracker();

		// Seed current URL on panel open.
		if (typeof chrome !== "undefined" && chrome.tabs?.query) {
			chrome.tabs
				.query({ active: true, currentWindow: true })
				.then((tabs) => {
					const url = tabs[0]?.url;
					if (url) tracker.onNavigate(url);
				})
				.catch(() => {});
		}

		// Listen for main-frame navigations.
		if (typeof chrome !== "undefined" && chrome.webNavigation?.onCommitted) {
			const handler = (
				details: chrome.webNavigation.WebNavigationTransitionCallbackDetails,
			) => {
				if (details.frameId === 0) tracker.onNavigate(details.url);
			};
			chrome.webNavigation.onCommitted.addListener(handler);
			return () => {
				chrome.webNavigation.onCommitted.removeListener(handler);
			};
		}
	}, []);

	return {
		initialized,
		workerReady,
		bridgeRef,
		extjsControllerRef,
		settingsControllerRef,
		sessionControllerRef,
		filesControllerRef,
	};
}
