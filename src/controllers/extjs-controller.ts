import { normalizeJsError } from "../errors/normalize-error";
import { ExtensionJsClient } from "../sidepanel/extension-js-client";
import { browsergentStore } from "../state/store";
import type { WorkerBridge } from "./worker-bridge";

export class ExtjsController {
	private client: ExtensionJsClient;

	constructor(private bridge: WorkerBridge) {
		this.client = ExtensionJsClient.getInstance();
	}

	async init(): Promise<void> {
		browsergentStore.getState().extjsInitializing();

		try {
			await this.client.init();
			browsergentStore.getState().extjsReady();
			ExtensionJsClient.relayCallback = (msg) => {
				this.bridge.post(msg);
			};
		} catch (err: unknown) {
			browsergentStore.getState().extjsFailed(normalizeJsError(err));
			throw err;
		}
	}

	handleRelayRequest(msg: {
		type: "extjsRunRequest";
		id: string;
		code: string;
	}): void {
		this.client.handleRelayRequest(msg);
	}

	async stop(): Promise<void> {
		try {
			await this.client.stop();
		} catch (err: unknown) {
			console.warn("Extjs stop failed:", err);
		}
	}

	async dispose(): Promise<void> {
		browsergentStore.getState().extjsDisposed();
		ExtensionJsClient.relayCallback = null;

		try {
			await this.client.dispose();
		} catch (err: unknown) {
			console.warn("Extjs dispose failed:", err);
		}
	}
}
