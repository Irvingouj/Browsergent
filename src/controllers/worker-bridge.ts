import type { BrowsergentErrorCode } from "../errors/browsergent-error";
import {
	isExtjsError,
	isExtjsOutput,
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
import type { PanelToWorker } from "../types/messages";

type ExtjsRunRequestHandler = (msg: {
	type: "extjsRunRequest";
	id: string;
	code: string;
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
	private onWorkerReady: WorkerReadyHandler | null = null;
	private onAgentStopped: AgentStoppedHandler | null = null;

	constructor(options?: {
		onExtjsRunRequest?: ExtjsRunRequestHandler;
		onExtjsDocsRequest?: ExtjsDocsRequestHandler;
		onLoadSkillRequest?: LoadSkillRequestHandler;
		onWorkerReady?: WorkerReadyHandler;
		onAgentStopped?: AgentStoppedHandler;
	}) {
		this.onExtjsRunRequest = options?.onExtjsRunRequest ?? null;
		this.onExtjsDocsRequest = options?.onExtjsDocsRequest ?? null;
		this.onLoadSkillRequest = options?.onLoadSkillRequest ?? null;
		this.onWorkerReady = options?.onWorkerReady ?? null;
		this.onAgentStopped = options?.onAgentStopped ?? null;
	}

	start(): void {
		const w = new Worker(chrome.runtime.getURL("agent-worker.js"), {
			type: "module",
		});

		w.onmessage = (e: MessageEvent<unknown>) => {
			this.handleMessage(e.data);
		};

		w.onerror = (err) => {
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
				if (browsergentStore.getState().agent.status !== "loading") {
					browsergentStore.getState().agentReset();
				}
				this.onWorkerReady?.();
				break;
			}
			case "agentStatus": {
				if (
					isStaleRunId(raw.runId, browsergentStore.getState().agent.activeRunId)
				)
					return;
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
				if (
					isStaleRunId(raw.runId, browsergentStore.getState().agent.activeRunId)
				)
					return;
				const { message } = raw;
				if (message.kind === "user") {
					browsergentStore.getState().appendUserMessage(message);
				} else if (message.kind === "assistant") {
					initStreamingSignal(message.id);
					browsergentStore.getState().appendAssistantMessage(message);
				} else {
					browsergentStore.getState().appendSystemMessage(message);
				}
				break;
			}
			case "agentTextDelta": {
				if (
					isStaleRunId(raw.runId, browsergentStore.getState().agent.activeRunId)
				)
					return;
				appendStreamingDelta(raw.messageId, raw.text);
				break;
			}
			case "agentMessageEnd": {
				if (
					isStaleRunId(raw.runId, browsergentStore.getState().agent.activeRunId)
				)
					return;
				this.finalizeMessageSignal(raw.messageId);
				break;
			}
			case "agentTrace": {
				if (
					isStaleRunId(raw.runId, browsergentStore.getState().agent.activeRunId)
				)
					return;
				browsergentStore.getState().traceUpdated(raw.entry);
				break;
			}
			case "agentDiagnostic": {
				if (
					isStaleRunId(raw.runId, browsergentStore.getState().agent.activeRunId)
				)
					return;
				browsergentStore.getState().diagnosticAdded(raw.event);
				break;
			}
			case "agentError": {
				if (
					isStaleRunId(raw.runId, browsergentStore.getState().agent.activeRunId)
				)
					return;
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
				if (isExtjsOutput(raw)) {
					browsergentStore.getState().extjsOutputAppended(raw.output);
				}
				break;
			}
			case "extjsError": {
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
