import type { BrowsergentErrorCode } from "../errors/browsergent-error";
import {
	isLuaError,
	isLuaOutput,
	isWorkerToPanel,
} from "../protocol/worker-guards";
import { browsergentStore } from "../state/store";
import {
	appendStreamingDelta,
	finalizeAllStreamingSignals,
	finalizeStreamingSignal,
	getStreamingSignal,
	initStreamingSignal,
} from "../state/streaming-signals";
import type { PanelToWorker } from "../types/messages";

type LuaRunRequestHandler = (msg: {
	type: "luaRunRequest";
	id: string;
	code: string;
}) => void;

export function isStaleRunId(runId: string, activeRunId?: string): boolean {
	if (runId === "unknown") return false;
	if (activeRunId === undefined) return true;
	return runId !== activeRunId;
}

export class WorkerBridge {
	private worker: Worker | null = null;
	private onLuaRunRequest: LuaRunRequestHandler | null = null;

	constructor(options?: {
		onLuaRunRequest?: LuaRunRequestHandler;
	}) {
		this.onLuaRunRequest = options?.onLuaRunRequest ?? null;
	}

	start(): void {
		const w = new Worker(chrome.runtime.getURL("worker.js"), {
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
			case "luaOutput": {
				if (isLuaOutput(raw)) {
					browsergentStore.getState().luaOutputAppended(raw.output);
				}
				break;
			}
			case "luaError": {
				if (isLuaError(raw)) {
					browsergentStore.getState().luaFailed({
						code: "E_LUA_RUNTIME",
						message: raw.error,
						source: "lua",
					});
				}
				break;
			}
			case "luaRunRequest":
				if (this.onLuaRunRequest) {
					this.onLuaRunRequest(raw);
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
