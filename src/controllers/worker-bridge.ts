import type { BrowsergentErrorCode } from "../errors/browsergent-error";
import { reportError } from "../errors/report";
import {
	isExtjsError,
	isExtjsOutput,
	isFileOpRequest,
	isLoadSkillRequest,
	isWorkerToPanel,
} from "../protocol/worker-guards";
import { notifySkillsChanged } from "../skills/skill-service";
import { browsergentStore } from "../state/store";
import {
	appendStreamingDelta,
	finalizeAllStreamingSignals,
	finalizeStreamingSignal,
	getStreamingSignal,
	initStreamingSignal,
} from "../state/streaming-signals";
import type { PanelToWorker, WorkerToPanel } from "../types/messages";
import type { FileOp } from "../worker/file-op-relay";

export interface RunRouting {
	shouldUpdateUi: (runId: string) => boolean;
	/** When false, worker crashes and extjs stream events skip global UI (in-panel background bridge). */
	shouldApplyBridgeEffects?: () => boolean;
	onRunEvent?: (runId: string, event: WorkerToPanel) => void;
}

type ExtjsRunRequestHandler = (msg: {
	type: "extjsRunRequest";
	id: string;
	code: string;
	traceId?: string;
}) => void;

type ExtjsDocsRequestHandler = (msg: {
	type: "extjsDocsRequest";
	id: string;
	format: "json" | "markdown";
}) => void;

type LoadSkillRequestHandler = (msg: {
	type: "loadSkillRequest";
	id: string;
	skill: string;
	path?: string;
}) => void;

type FileOpRequestHandler = (msg: {
	type: "fileOpRequest";
	id: string;
	sessionId: string;
	op: FileOp;
}) => void;

type WorkerReadyHandler = () => void;
type AgentStoppedHandler = () => void;

export function isStaleRunId(runId: string, activeRunId?: string): boolean {
	if (runId === "unknown") return false;
	if (activeRunId === undefined) return true;
	return runId !== activeRunId;
}

export class WorkerBridge {
	private worker: Worker | null = null;
	private onExtjsRunRequest: ExtjsRunRequestHandler | null = null;
	private onExtjsDocsRequest: ExtjsDocsRequestHandler | null = null;
	private onLoadSkillRequest: LoadSkillRequestHandler | null = null;
	private onFileOpRequest: FileOpRequestHandler | null = null;
	private onWorkerReady: WorkerReadyHandler | null = null;
	private onAgentStopped: AgentStoppedHandler | null = null;
	private runRouting: RunRouting | null = null;

	constructor(options?: {
		onExtjsRunRequest?: ExtjsRunRequestHandler;
		onExtjsDocsRequest?: ExtjsDocsRequestHandler;
		onLoadSkillRequest?: LoadSkillRequestHandler;
		onFileOpRequest?: FileOpRequestHandler;
		onWorkerReady?: WorkerReadyHandler;
		onAgentStopped?: AgentStoppedHandler;
		runRouting?: RunRouting;
	}) {
		this.onExtjsRunRequest = options?.onExtjsRunRequest ?? null;
		this.onExtjsDocsRequest = options?.onExtjsDocsRequest ?? null;
		this.onLoadSkillRequest = options?.onLoadSkillRequest ?? null;
		this.onFileOpRequest = options?.onFileOpRequest ?? null;
		this.onWorkerReady = options?.onWorkerReady ?? null;
		this.onAgentStopped = options?.onAgentStopped ?? null;
		this.runRouting = options?.runRouting ?? null;
	}

	private shouldApplyToUi(runId: string): boolean {
		if (this.runRouting) {
			return this.runRouting.shouldUpdateUi(runId);
		}
		return !isStaleRunId(runId, browsergentStore.getState().agent.activeRunId);
	}

	private shouldApplyBridgeEffects(): boolean {
		if (this.runRouting?.shouldApplyBridgeEffects) {
			return this.runRouting.shouldApplyBridgeEffects();
		}
		return true;
	}

	private dispatchRunEvent(runId: string, event: WorkerToPanel): void {
		this.runRouting?.onRunEvent?.(runId, event);
	}

	start(): void {
		const w = new Worker(chrome.runtime.getURL("agent-worker.js"), {
			type: "module",
		});

		w.onmessage = (e: MessageEvent<unknown>) => {
			this.handleMessage(e.data);
		};

		w.onerror = (err) => {
			reportError({
				code: "E_BOOT_WORKER",
				source: "worker",
				message: `Agent worker error: ${err.message}`,
				details: { filename: err.filename, lineno: err.lineno },
			});
			if (!this.shouldApplyBridgeEffects()) {
				this.stop();
				return;
			}
			const store = browsergentStore.getState();
			store.agentFailed({
				code: "E_WORKER_CRASH",
				message: `Worker error: ${err.message}`,
				source: "worker",
			});
			this.finalizeActiveSignals();
			this.stop();
		};

		this.worker = w;
	}

	stop(): void {
		if (!this.worker) return;
		this.worker.onmessage = null;
		this.worker.onerror = null;
		this.worker.terminate();
		this.worker = null;
	}

	restart(): void {
		this.stop();
		this.start();
	}

	post(message: PanelToWorker): void {
		if (!this.worker) this.start();
		this.worker?.postMessage(message);
	}

	private handleMessage(raw: unknown): void {
		if (!isWorkerToPanel(raw)) {
			const text =
				typeof raw === "object" && raw !== null
					? `Received invalid message from worker: type=${(raw as Record<string, unknown>).type ?? "undefined"} ${JSON.stringify(raw).slice(0, 200)}`
					: `Received invalid message from worker: ${String(raw).slice(0, 200)}`;
			browsergentStore.getState().appendSystemMessage({
				kind: "system",
				id: crypto.randomUUID(),
				text,
				timestamp: Date.now(),
			});
			return;
		}

		switch (raw.type) {
			case "workerReady": {
				if (
					!this.runRouting &&
					browsergentStore.getState().agent.status !== "loading"
				) {
					browsergentStore.getState().agentReset();
				}
				this.onWorkerReady?.();
				break;
			}
			case "agentStatus": {
				this.dispatchRunEvent(raw.runId, raw);
				if (!this.shouldApplyToUi(raw.runId)) return;
				browsergentStore.getState().agentStatusChanged(raw.status, raw.reason);
				if (
					raw.status === "stopped" ||
					raw.status === "error" ||
					raw.status === "done"
				) {
					this.finalizeActiveSignals();
					notifySkillsChanged();
				}
				if (raw.status === "stopped") {
					this.onAgentStopped?.();
				}
				break;
			}
			case "agentMessage": {
				this.dispatchRunEvent(raw.runId, raw);
				if (!this.shouldApplyToUi(raw.runId)) return;
				const { message } = raw;
				if (message.kind === "user") {
					browsergentStore.getState().appendUserMessage(message);
				} else if (message.kind === "assistant") {
					// Idempotent: post-tool turns can redeliver empty assistant shells.
					const existing =
						browsergentStore.getState().chat.messagesById[message.id];
					if (!existing) {
						initStreamingSignal(message.id);
						browsergentStore.getState().appendAssistantMessage(message);
					} else {
						initStreamingSignal(message.id);
					}
				} else {
					browsergentStore.getState().appendSystemMessage(message);
				}
				break;
			}
			case "agentTextDelta": {
				this.dispatchRunEvent(raw.runId, raw);
				if (!this.shouldApplyToUi(raw.runId)) return;
				const store = browsergentStore.getState();
				// Self-heal: if agentMessage was dropped (registry gate race), still
				// create the bubble so post-tool streams are visible.
				if (!store.chat.messagesById[raw.messageId]) {
					initStreamingSignal(raw.messageId);
					store.appendAssistantMessage({
						kind: "assistant",
						id: raw.messageId,
						text: "",
						timestamp: Date.now(),
					});
				}
				if (
					store.agent.status === "waiting_for_model" ||
					store.agent.status === "loading"
				) {
					store.agentStatusChanged("running");
				}
				appendStreamingDelta(raw.messageId, raw.text);
				// Mirror into store so chat survives signal/render glitches.
				const streamed = getStreamingSignal(raw.messageId)?.value ?? raw.text;
				browsergentStore
					.getState()
					.finalizeAssistantMessage(raw.messageId, streamed);
				break;
			}
			case "agentMessageEnd": {
				this.dispatchRunEvent(raw.runId, raw);
				if (!this.shouldApplyToUi(raw.runId)) return;
				this.finalizeMessageSignal(raw.messageId);
				break;
			}
			case "agentTrace": {
				this.dispatchRunEvent(raw.runId, raw);
				if (!this.shouldApplyToUi(raw.runId)) return;
				browsergentStore.getState().traceUpdated(raw.entry);
				break;
			}
			case "agentDiagnostic": {
				this.dispatchRunEvent(raw.runId, raw);
				if (!this.shouldApplyToUi(raw.runId)) return;
				browsergentStore.getState().diagnosticAdded(raw.event);
				break;
			}
			case "agentError": {
				this.dispatchRunEvent(raw.runId, raw);
				if (!this.shouldApplyToUi(raw.runId)) return;
				const error = raw.error;
				browsergentStore.getState().agentFailed({
					code:
						typeof error.code === "string"
							? (error.code as BrowsergentErrorCode)
							: "E_UNKNOWN",
					message: error.message,
					source: "agent",
					details: error.details,
				});
				browsergentStore.getState().appendSystemMessage({
					kind: "system",
					id: crypto.randomUUID(),
					text: `Error: ${error.message}`,
					timestamp: Date.now(),
				});
				break;
			}
			case "extjsOutput": {
				if (!this.shouldApplyBridgeEffects()) break;
				if (isExtjsOutput(raw)) {
					browsergentStore.getState().extjsOutputAppended(raw.output);
				}
				break;
			}
			case "extjsError": {
				if (!this.shouldApplyBridgeEffects()) break;
				if (isExtjsError(raw)) {
					browsergentStore.getState().extjsFailed({
						code: "E_JS_RUNTIME",
						message: raw.error,
						source: "js",
					});
				}
				break;
			}
			case "extjsRunRequest":
				if (this.onExtjsRunRequest) {
					this.onExtjsRunRequest(raw);
				}
				break;
			case "extjsDocsRequest":
				if (this.onExtjsDocsRequest) {
					this.onExtjsDocsRequest(raw);
				}
				break;
			case "loadSkillRequest":
				if (isLoadSkillRequest(raw) && this.onLoadSkillRequest) {
					this.onLoadSkillRequest(raw);
				}
				break;
			case "fileOpRequest":
				if (isFileOpRequest(raw) && this.onFileOpRequest) {
					this.onFileOpRequest(
						raw as {
							type: "fileOpRequest";
							id: string;
							sessionId: string;
							op: FileOp;
						},
					);
				}
				break;
		}
	}

	private finalizeMessageSignal(messageId: string): void {
		const sig = getStreamingSignal(messageId);
		const text = sig?.value ?? "";
		browsergentStore.getState().finalizeAssistantMessage(messageId, text);
		finalizeStreamingSignal(messageId);
	}

	private finalizeActiveSignals(): void {
		const pending = finalizeAllStreamingSignals();
		const store = browsergentStore.getState();
		for (const { messageId, text } of pending) {
			if (text) {
				store.finalizeAssistantMessage(messageId, text);
			}
		}
	}
}
