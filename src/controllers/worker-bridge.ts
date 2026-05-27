import type { BrowsergentErrorCode } from "../errors/browsergent-error";
import {
	isLuaError,
	isLuaOutput,
	isWorkerToPanel,
} from "../protocol/worker-guards";
import { browsergentStore } from "../state/store";
import type { PanelToWorker } from "../types/messages";

type LuaRunRequestHandler = (msg: {
	type: "luaRunRequest";
	id: string;
	code: string;
}) => void;

type AgentHistoryHandler = (
	messages: Array<{ role: "user" | "assistant"; content: string }>,
) => void;

export class WorkerBridge {
	private worker: Worker | null = null;
	private onLuaRunRequest: LuaRunRequestHandler | null = null;
	private onAgentHistory: AgentHistoryHandler | null = null;

	constructor(options?: {
		onLuaRunRequest?: LuaRunRequestHandler;
		onAgentHistory?: AgentHistoryHandler;
	}) {
		this.onLuaRunRequest = options?.onLuaRunRequest ?? null;
		this.onAgentHistory = options?.onAgentHistory ?? null;
	}

	start(): void {
		const w = new Worker(chrome.runtime.getURL("worker.js"), {
			type: "module",
		});

		w.onmessage = (e: MessageEvent<unknown>) => {
			this.handleMessage(e.data);
		};

		w.onerror = (err) => {
			browsergentStore.getState().appendSystemMessage({
				kind: "system",
				id: crypto.randomUUID(),
				text: `Worker error: ${err.message}`,
				timestamp: Date.now(),
			});
			this.stop();
		};

		this.worker = w;
	}

	stop(): void {
		if (!this.worker) return;
		this.worker.terminate();
		this.worker = null;
	}

	post(message: PanelToWorker): void {
		this.worker?.postMessage(message);
	}

	private isStaleRunId(runId: string): boolean {
		const activeRunId = browsergentStore.getState().agent.activeRunId;
		if (runId === "unknown") return false;
		return activeRunId !== undefined && runId !== activeRunId;
	}

	private handleMessage(raw: unknown): void {
		if (!isWorkerToPanel(raw)) {
			browsergentStore.getState().appendSystemMessage({
				kind: "system",
				id: crypto.randomUUID(),
				text: "Received invalid message from worker",
				timestamp: Date.now(),
			});
			return;
		}

		switch (raw.type) {
			case "workerReady":
				browsergentStore.getState().agentReset();
				break;
			case "agentStatus": {
				if (this.isStaleRunId(raw.runId)) return;
				browsergentStore.getState().agentStatusChanged(raw.status, raw.reason);
				break;
			}
			case "agentMessage": {
				if (this.isStaleRunId(raw.runId)) return;
				const { message } = raw;
				if (message.kind === "user") {
					browsergentStore.getState().appendUserMessage(message);
				} else if (message.kind === "assistant") {
					browsergentStore.getState().appendAssistantMessage(message);
				} else {
					browsergentStore.getState().appendSystemMessage(message);
				}
				break;
			}
			case "agentTextDelta": {
				if (this.isStaleRunId(raw.runId)) return;
				browsergentStore
					.getState()
					.appendAssistantDelta(raw.messageId, raw.text);
				break;
			}
			case "agentTrace": {
				if (this.isStaleRunId(raw.runId)) return;
				browsergentStore.getState().traceUpdated(raw.entry);
				break;
			}
			case "agentError": {
				if (this.isStaleRunId(raw.runId)) return;
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
			case "agentHistory": {
				if (this.isStaleRunId(raw.runId)) return;
				if (this.onAgentHistory && Array.isArray(raw.messages)) {
					this.onAgentHistory(raw.messages);
				}
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
}
