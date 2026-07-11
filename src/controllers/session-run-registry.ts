import type { AgentRunStatus } from "../state/slices/agent-slice";
import { browsergentStore } from "../state/store";

/** foreground = chat UI session; headless = in-panel background run (panel still open). */
export type RunAttachment = "foreground" | "headless";

export interface SessionRunState {
	sessionId: string;
	runId: string;
	status: AgentRunStatus;
	attachment: RunAttachment;
}

export class SessionRunRegistry {
	private readonly bySession = new Map<string, SessionRunState>();
	private readonly runToSession = new Map<string, string>();

	register(sessionId: string, runId: string, status: AgentRunStatus): void {
		const state: SessionRunState = {
			sessionId,
			runId,
			status,
			attachment: "foreground",
		};
		this.bySession.set(sessionId, state);
		this.runToSession.set(runId, sessionId);
	}

	detach(sessionId: string): void {
		const state = this.bySession.get(sessionId);
		if (!state) return;
		state.attachment = "headless";
	}

	attach(sessionId: string): void {
		const state = this.bySession.get(sessionId);
		if (!state) return;
		state.attachment = "foreground";
	}

	updateStatus(runId: string, status: AgentRunStatus): void {
		const sessionId = this.runToSession.get(runId);
		if (!sessionId) return;
		const state = this.bySession.get(sessionId);
		if (!state) return;
		state.status = status;
	}

	getBySession(sessionId: string): SessionRunState | undefined {
		return this.bySession.get(sessionId);
	}

	getByRunId(runId: string): SessionRunState | undefined {
		const sessionId = this.runToSession.get(runId);
		if (!sessionId) return undefined;
		return this.bySession.get(sessionId);
	}

	isRunning(sessionId: string): boolean {
		return this.bySession.has(sessionId);
	}

	getRunningSessionIds(): string[] {
		return [...this.bySession.keys()];
	}

	shouldUpdateUi(runId: string): boolean {
		// Active UI run always paints — matches pre-multi-window WorkerBridge
		// (isStaleRunId only). Registry attachment is secondary: a premature
		// clear/detach after tool batches must not swallow post-tool text.
		if (browsergentStore.getState().agent.activeRunId === runId) {
			return true;
		}
		const state = this.getByRunId(runId);
		return state?.attachment === "foreground";
	}

	clear(sessionId: string): void {
		const state = this.bySession.get(sessionId);
		if (!state) return;
		this.runToSession.delete(state.runId);
		this.bySession.delete(sessionId);
	}
}

export function isAgentRunActive(status: AgentRunStatus): boolean {
	return (
		status === "loading" ||
		status === "running" ||
		status === "waiting_for_model" ||
		status === "executing_tool"
	);
}
