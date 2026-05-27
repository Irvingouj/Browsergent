import { normalizeLuaError } from "../errors/normalize-error";
import { ExtensionLuaClient } from "../sidepanel/extension-lua-client";
import { browsergentStore } from "../state/store";
import type { WorkerBridge } from "./worker-bridge";

export class LuaController {
	private client: ExtensionLuaClient;

	constructor(private bridge: WorkerBridge) {
		this.client = ExtensionLuaClient.getInstance();
	}

	async init(): Promise<void> {
		browsergentStore.getState().luaInitializing();

		try {
			await this.client.init();
			browsergentStore.getState().luaReady();
			ExtensionLuaClient.relayCallback = (msg) => {
				this.bridge.post(msg);
			};
		} catch (err: unknown) {
			browsergentStore.getState().luaFailed(normalizeLuaError(err));
			throw err;
		}
	}

	handleRelayRequest(msg: {
		type: "luaRunRequest";
		id: string;
		code: string;
	}): void {
		this.client.handleRelayRequest(msg);
	}

	async dispose(): Promise<void> {
		browsergentStore.getState().luaDisposed();
		ExtensionLuaClient.relayCallback = null;

		try {
			await this.client.dispose();
		} catch (err: unknown) {
			console.warn("Lua dispose failed:", err);
		}
	}
}
