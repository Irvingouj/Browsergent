import { normalizeJsError } from "../errors/normalize-error";
import { reportError, reportWarn } from "../errors/report";
import {
	ExtensionJsClient,
	type ExtjsRelayResponse,
} from "../sidepanel/extension-js-client";
import { getSkillService } from "../skills/skill-service";
import { browsergentStore } from "../state/store";
import type { PanelToWorker } from "../types/messages";

export type WorkerPostFn = (message: PanelToWorker) => void;

export class ExtjsController {
	private client: ExtensionJsClient;

	constructor(private postToWorker: WorkerPostFn) {
		this.client = ExtensionJsClient.getInstance();
	}

	async init(options?: { windowId?: number }): Promise<void> {
		browsergentStore.getState().extjsInitializing();

		try {
			await this.client.init(options);
			ExtensionJsClient.relayCallback = (msg: ExtjsRelayResponse) => {
				this.postToWorker(msg);
			};
			this.client.setOnFsMutation(() => {
				browsergentStore.getState().incrementFilesVersion();
			});
			browsergentStore.getState().extjsReady();
		} catch (err: unknown) {
			const normalized = normalizeJsError(err);
			browsergentStore.getState().extjsFailed(normalized);
			reportError({
				code: "E_BOOT_EXTJS",
				source: "extjs",
				message: normalized.message,
				cause: err,
			});
			throw err;
		}

		try {
			await getSkillService().ensureReady();
		} catch (err: unknown) {
			reportWarn({
				code: "E_HOST_UNKNOWN",
				source: "boot",
				message: "Skill initialization failed",
				cause: err,
			});
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
				this.postToWorker({ type: "loadSkillResult", id, content });
			})
			.catch((err: unknown) => {
				this.postToWorker({
					type: "loadSkillError",
					id,
					error: err instanceof Error ? err.message : String(err),
				});
			});
	}

	getWindowId(): number | null {
		return this.client.getWindowId();
	}

	rebindWindow(newWindowId: number): void {
		this.client.rebindWindow(newWindowId);
	}

	async stop(): Promise<void> {
		try {
			await this.client.stop();
		} catch (err: unknown) {
			reportWarn({
				code: "E_BOOT_EXTJS",
				source: "extjs",
				message: "Extjs stop failed",
				cause: err,
			});
		}
	}

	async dispose(): Promise<void> {
		browsergentStore.getState().extjsDisposed();
		ExtensionJsClient.relayCallback = null;

		try {
			await this.client.dispose();
		} catch (err: unknown) {
			reportWarn({
				code: "E_BOOT_EXTJS",
				source: "extjs",
				message: "Extjs dispose failed",
				cause: err,
			});
		}
	}
}
