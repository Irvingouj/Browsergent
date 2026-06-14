import { normalizeJsError } from "../errors/normalize-error";
import { getSkillService } from "../skills/skill-service";
import {
	ExtensionJsClient,
	type ExtjsRelayResponse,
} from "../sidepanel/extension-js-client";
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
			ExtensionJsClient.relayCallback = (msg: ExtjsRelayResponse) => {
				this.bridge.post(msg);
			};
			this.client.setOnFsMutation(() => {
				browsergentStore.getState().incrementFilesVersion();
			});
			browsergentStore.getState().extjsReady();
		} catch (err: unknown) {
			browsergentStore.getState().extjsFailed(normalizeJsError(err));
			throw err;
		}

		try {
			await getSkillService().ensureReady();
		} catch (err: unknown) {
			console.warn(
				"Skill initialization failed:",
				err instanceof Error ? err.message : String(err),
			);
		}
	}

	handleRelayRequest(msg: {
		type: "extjsRunRequest";
		id: string;
		code: string;
	}): void {
		this.client.handleRelayRequest(msg);
	}

	handleDocsRelayRequest(msg: {
		type: "extjsDocsRequest";
		id: string;
		format: "json" | "markdown";
	}): void {
		this.client.handleDocsRelayRequest(msg);
	}

	handleLoadSkillRelayRequest(msg: {
		type: "loadSkillRequest";
		id: string;
		skill: string;
		path?: string;
		activatedSkills?: string[];
	}): void {
		const { id, skill, path: resourcePath, activatedSkills } = msg;

		getSkillService()
			.loadSkill(skill, resourcePath, {
				source: "tool",
				activatedSkills,
			})
			.then((content) => {
				this.bridge.post({ type: "loadSkillResult", id, content });
			})
			.catch((err: unknown) => {
				this.bridge.post({
					type: "loadSkillError",
					id,
					error: err instanceof Error ? err.message : String(err),
				});
			});
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
