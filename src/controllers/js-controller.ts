import { normalizeJsError } from "../errors/normalize-error";
import { ExtensionJsClient } from "../sidepanel/extension-js-client";
import { browsergentStore } from "../state/store";
import type { WorkerBridge } from "./worker-bridge";

export class JsController {
	private client: ExtensionJsClient;

	constructor(private bridge: WorkerBridge) {
		this.client = ExtensionJsClient.getInstance();
	}

	async init(): Promise<void> {
		browsergentStore.getState().jsInitializing();

		try {
			await this.client.init();
			browsergentStore.getState().jsReady();
			ExtensionJsClient.relayCallback = (msg) => {
				this.bridge.post(msg);
			};
		} catch (err: unknown) {
			browsergentStore.getState().jsFailed(normalizeJsError(err));
			throw err;
		}
	}

	handleRelayRequest(msg: {
		type: "jsRunRequest";
		id: string;
		code: string;
	}): void {
		this.client.handleRelayRequest(msg);
	}

	async dispose(): Promise<void> {
		browsergentStore.getState().jsDisposed();
		ExtensionJsClient.relayCallback = null;

		try {
			await this.client.dispose();
		} catch (err: unknown) {
			console.warn("JS dispose failed:", err);
		}
	}
}
