import { normalizeJsError } from "../errors/normalize-error";
import { reportError, reportWarn } from "../errors/report";
import {
	ExtensionJsClient,
	type ExtjsRelayResponse,
} from "../sidepanel/extension-js-client";
import { scheduleFileTreeRefresh } from "../sidepanel/components/files/refresh-file-tree";
import { getSkillService } from "../skills/skill-service";
import { browsergentStore } from "../state/store";
import type { PanelToWorker } from "../types/messages";

export type WorkerPostFn = (message: PanelToWorker) => void;

export class ExtjsController {
	private client: ExtensionJsClient;

	constructor(private postToWorker: WorkerPostFn) {
		this.client = ExtensionJsClient.getInstance();
	}

	/**
	 * Boot extension-js only. Skills are seeded/listed lazily on first use
	 * (picker, run start, load_skill, URL match, import) — not during panel init.
	 */
	async init(options?: { windowId?: number }): Promise<void> {
		browsergentStore.getState().extjsInitializing();

		try {
			await this.client.init(options);
			ExtensionJsClient.relayCallback = (msg: ExtjsRelayResponse) => {
				this.postToWorker(msg);
			};
			// Panel FS writes and successful run_js cells (agent fs.move/delete/…)
			// only used to bump filesVersion; the Files tree no longer re-lists on
			// that counter (feedback loop). Schedule a real shallow re-list instead.
			this.client.setOnFsMutation(() => {
				scheduleFileTreeRefresh();
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
