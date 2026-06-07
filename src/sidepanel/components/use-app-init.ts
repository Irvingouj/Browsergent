import { useEffect, useRef, useState } from "preact/hooks";
import { ExtjsController } from "../../controllers/extjs-controller";
import { SessionController } from "../../controllers/session-controller";
import { SettingsController } from "../../controllers/settings-controller";
import { WorkerBridge } from "../../controllers/worker-bridge";
import { browsergentStore } from "../../state/store";
import { IndexedDBStorage } from "../../storage/indexeddb-storage";
import { MemoryStorage } from "../../storage/memory-storage";
import { migrateFromChromeStorage } from "../../storage/migrate";
import type { StorageBackend } from "../../storage/storage-backend";

export interface AppInitResult {
	initialized: boolean;
	workerReady: boolean;
	bridgeRef: { current: WorkerBridge | null };
	extjsControllerRef: { current: ExtjsController | null };
	settingsControllerRef: { current: SettingsController | null };
	sessionControllerRef: { current: SessionController | null };
}

export function useAppInit(): AppInitResult {
	const [initialized, setInitialized] = useState(false);
	const [workerReady, setWorkerReady] = useState(false);
	const bridgeRef = useRef<WorkerBridge | null>(null);
	const extjsControllerRef = useRef<ExtjsController | null>(null);
	const settingsControllerRef = useRef<SettingsController | null>(null);
	const sessionControllerRef = useRef<SessionController | null>(null);

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

			extjs.init().catch((err: unknown) => {
				console.warn("JS init failed:", err);
			});
			bridge.start();
			sessionCtrl
				.load()
				.then((session) => {
					if (session) {
						browsergentStore.getState().hydrateChat(session.messages);
						browsergentStore.getState().hydrateTrace(session.trace);
					}
					sessionCtrl.hydrated = true;
				})
				.catch((err: unknown) => {
					console.warn("Session load failed:", err);
					sessionCtrl.hydrated = true;
				});
			const sessionList = await sessionCtrl.listSessions();
			browsergentStore.getState().sessionListLoaded(sessionList);
			browsergentStore
				.getState()
				.activeSessionChanged(sessionCtrl.getActiveSessionId() || "");

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

	return {
		initialized,
		workerReady,
		bridgeRef,
		extjsControllerRef,
		settingsControllerRef,
		sessionControllerRef,
	};
}
