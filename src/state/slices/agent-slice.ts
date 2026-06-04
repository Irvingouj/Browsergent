import type { StoreApi } from "zustand/vanilla";
import type { BrowsergentError } from "../../errors/browsergent-error";
import type { AgentStatus } from "../../types/messages";
import type { BrowsergentStore } from "../store";

export type AgentRunStatus = AgentStatus;

export interface AgentState {
	status: AgentRunStatus;
	statusReason?: string;
	activeRunId?: string;
	lastError?: BrowsergentError;
}

export interface AgentActions {
	agentRunRequested(runId: string): void;
	agentStatusChanged(status: AgentRunStatus, reason?: string): void;
	agentStopped(reason?: string): void;
	agentFailed(error: BrowsergentError): void;
	agentReset(): void;
}

export interface AgentSlice {
	agent: AgentState;
	agentRunRequested(runId: string): void;
	agentStatusChanged(status: AgentRunStatus, reason?: string): void;
	agentStopped(reason?: string): void;
	agentFailed(error: BrowsergentError): void;
	agentReset(): void;
}

export function createAgentSlice(
	set: StoreApi<BrowsergentStore>["setState"],
	_get: StoreApi<BrowsergentStore>["getState"],
): AgentSlice {
	return {
		agent: { status: "idle" },
		agentRunRequested(runId) {
			set((state) => ({
				agent: {
					...state.agent,
					activeRunId: runId,
					status: "loading",
					lastError: undefined,
					statusReason: undefined,
				},
			}));
		},
		agentStatusChanged(status, reason) {
			set((state) => ({
				agent: {
					...state.agent,
					status,
					statusReason: reason,
					lastError: status === "error" ? state.agent.lastError : undefined,
				},
			}));
		},
		agentStopped(reason) {
			set((state) => ({
				agent: { ...state.agent, status: "stopped", statusReason: reason },
			}));
		},
		agentFailed(error) {
			set((state) => ({
				agent: {
					...state.agent,
					status: "error",
					lastError: error,
					activeRunId: undefined,
				},
			}));
		},
		agentReset() {
			set({
				agent: {
					status: "idle",
					activeRunId: undefined,
					lastError: undefined,
					statusReason: undefined,
				},
			});
		},
	};
}
