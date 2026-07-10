import type { BrowsergentErrorCode } from "../errors/browsergent-error";
import type { AgentRunStatus } from "../state/slices/agent-slice";
import { notifySkillsChanged } from "../skills/skill-service";
import { browsergentStore } from "../state/store";
import {
	appendStreamingDelta,
	finalizeStreamingSignal,
	initStreamingSignal,
} from "../state/streaming-signals";
import type { PanelToWorker, WorkerToPanel } from "../types/messages";
import { OffscreenProxyBridge } from "./offscreen-proxy-bridge";
import { SessionRunRegistry } from "./session-run-registry";
import { SessionRunSink } from "./session-run-sink";
import type { SessionController } from "./session-controller";
import { WorkerBridge } from "./worker-bridge";
import type { FileOp } from "../worker/file-op-relay";

type RunningSessionsChangedHandler = () => void;

export type RunBridge = WorkerBridge | OffscreenProxyBridge;

type BridgeHandlers = {
	onExtjsRunRequest: (
		msg: {
			type: "extjsRunRequest";
			id: string;
			code: string;
			traceId?: string;
		},
		sessionId: string,
	) => void;
	onExtjsDocsRequest: (
		msg: {
			type: "extjsDocsRequest";
			id: string;
			format: "json" | "markdown";
		},
		sessionId: string,
	) => void;
	onLoadSkillRequest: (
		msg: {
			type: "loadSkillRequest";
			id: string;
			skill: string;
			path?: string;
		},
		sessionId: string,
	) => void;
	onFileOpRequest: (msg: {
		type: "fileOpRequest";
		id: string;
		sessionId: string;
		op: FileOp;
	}) => void;
	onWorkerReady?: (sessionId: string) => void;
	onAgentStopped?: () => void;
	onRunningSessionsChanged?: RunningSessionsChangedHandler;
	/** Headless host: publish run events to panels via background relay. */
	onRunEventPublished?: (sessionId: string, event: WorkerToPanel) => void;
	/** Local host: relay events for cross-panel merge subscribe. */
	onSessionRunRelay?: (sessionId: string, event: WorkerToPanel) => void;
};

export type RunSupervisorOptions = {
	/**
	 * Where agent workers live.
	 * - `"local"` (product default): workers in the side panel document. Closing the
	 *   panel ends runs — intentional. In-panel “background” = other sessions still
	 *   running in the same open panel, not panel-close survival.
	 * - `"offscreen"`: legacy option; not a product goal (do not use for “survive panel close”).
	 */
	hosting?: "local" | "offscreen";
	getWindowId?: () => number | null;
};

const TERMINAL_STATUSES = new Set<AgentRunStatus>(["stopped", "error", "done"]);

export class RunSupervisor {
	private readonly registry = new SessionRunRegistry();
	private readonly sink: SessionRunSink;
	private readonly bridges = new Map<string, RunBridge>();
	private readonly relayBridgeByRequestId = new Map<string, RunBridge>();
	private readonly hosting: "local" | "offscreen";
	private readonly getWindowId: (() => number | null) | null;
	private foregroundSessionId: string | null = null;
	private workerReady = false;

	constructor(
		private readonly sessionController: SessionController,
		private readonly handlers: BridgeHandlers,
		options: RunSupervisorOptions = {},
	) {
		this.sink = new SessionRunSink(sessionController);
		this.hosting = options.hosting ?? "local";
		this.getWindowId = options.getWindowId ?? null;
	}

	getRegistry(): SessionRunRegistry {
		return this.registry;
	}

	/**
	 * True when this panel owns the in-process worker for the session.
	 * Uses bridge presence (not registry.isRunning): the registry is cleared on
	 * terminal status, but late sessionRunRelay/storage echoes must still be
	 * ignored so the origin panel does not re-apply the same events 2–3×.
	 */
	isLocalWorkerHost(sessionId: string): boolean {
		return this.hosting === "local" && this.bridges.has(sessionId);
	}

	isWorkerReady(): boolean {
		return this.workerReady;
	}

	setForegroundSession(sessionId: string): void {
		this.foregroundSessionId = sessionId;
	}

	getForegroundSessionId(): string | null {
		return this.foregroundSessionId;
	}

	getForegroundBridge(): RunBridge {
		if (!this.foregroundSessionId) {
			throw new Error("No foreground session bound");
		}
		return this.ensureBridge(this.foregroundSessionId);
	}

	ensureBridge(sessionId: string): RunBridge {
		const existing = this.bridges.get(sessionId);
		if (existing) return existing;

		if (this.hosting === "offscreen") {
			const proxy = new OffscreenProxyBridge(
				sessionId,
				this.getWindowId ?? (() => null),
			);
			proxy.start();
			this.bridges.set(sessionId, proxy);
			return proxy;
		}

		const bridgeSessionId = sessionId;
		const bridge = new WorkerBridge({
			onExtjsRunRequest: (msg) => {
				this.trackRelay(msg.id, bridge);
				this.handlers.onExtjsRunRequest(msg, bridgeSessionId);
			},
			onExtjsDocsRequest: (msg) => {
				this.trackRelay(msg.id, bridge);
				this.handlers.onExtjsDocsRequest(msg, bridgeSessionId);
			},
			onLoadSkillRequest: (msg) => {
				this.trackRelay(msg.id, bridge);
				this.handlers.onLoadSkillRequest(msg, bridgeSessionId);
			},
			onFileOpRequest: (msg) => {
				this.trackRelay(msg.id, bridge);
				this.handlers.onFileOpRequest(msg);
			},
			runRouting: {
				shouldUpdateUi: (runId) => this.registry.shouldUpdateUi(runId),
				shouldApplyBridgeEffects: () =>
					this.foregroundSessionId === bridgeSessionId,
				onRunEvent: (runId, event) => {
					void this.handleRunEvent(runId, event);
					this.handlers.onRunEventPublished?.(bridgeSessionId, event);
					this.handlers.onSessionRunRelay?.(bridgeSessionId, event);
				},
			},
			onWorkerReady: () => {
				this.workerReady = true;
				this.handlers.onWorkerReady?.(bridgeSessionId);
			},
			onAgentStopped: () => {
				if (this.registry.getRunningSessionIds().length > 0) return;
				this.handlers.onAgentStopped?.();
			},
		});
		bridge.start();
		this.bridges.set(sessionId, bridge);
		return bridge;
	}

	trackRelay(requestId: string, bridge: RunBridge): void {
		this.relayBridgeByRequestId.set(requestId, bridge);
	}

	postRelay(requestId: string | undefined, message: PanelToWorker): void {
		const bridge =
			(requestId ? this.relayBridgeByRequestId.get(requestId) : undefined) ??
			(this.foregroundSessionId
				? this.bridges.get(this.foregroundSessionId)
				: undefined);
		if (!bridge) return;
		bridge.post(message);
		if (requestId) {
			this.relayBridgeByRequestId.delete(requestId);
		}
	}

	/**
	 * Bind UI to a session without starting the agent worker (cold boot).
	 * Worker is created on first postToForeground / postToSession / registerRun.
	 */
	startForeground(sessionId: string): RunBridge | null {
		this.foregroundSessionId = sessionId;
		const existing = this.bridges.get(sessionId);
		return existing ?? null;
	}

	/** Ensure worker exists for a run (first agentStart path). */
	ensureWorkerForSession(sessionId: string): RunBridge {
		this.foregroundSessionId = sessionId;
		return this.ensureBridge(sessionId);
	}

	registerRun(sessionId: string, runId: string): void {
		this.registry.register(sessionId, runId, "loading");
		this.ensureBridge(sessionId);
		this.handlers.onRunningSessionsChanged?.();
	}

	adoptRemoteRun(
		sessionId: string,
		runId: string,
		status: AgentRunStatus,
	): void {
		if (this.registry.isRunning(sessionId)) return;
		this.registry.register(sessionId, runId, status);
		this.ensureBridge(sessionId);
		this.handlers.onRunningSessionsChanged?.();
	}

	/**
	 * Apply a run event received from another panel (sessionRunRelay / storage).
	 *
	 * Cross-panel observers must NOT:
	 * - inject foreign sessions into this panel's chat UI
	 * - dual-write the session body to IDB (the local host already sinks)
	 *
	 * They only track running state for badges, unless this panel's foreground
	 * session is exactly the remote session (merge-adopt while viewing it).
	 */
	applyRemoteRunEvent(sessionId: string, event: WorkerToPanel): void {
		if (event.type === "workerReady") {
			this.workerReady = true;
			this.handlers.onWorkerReady?.(sessionId);
			return;
		}
		const runId = "runId" in event ? event.runId : undefined;
		if (!runId) return;

		const isForeground = this.foregroundSessionId === sessionId;
		if (!this.registry.getByRunId(runId)) {
			this.registry.register(sessionId, runId, "loading");
			// Badge-only for foreign/remote sessions; do not mark as chat UI owner.
			if (!isForeground) {
				this.registry.detach(sessionId);
			}
		}

		if (isForeground) {
			this.applyRemoteRunEventToUi(runId, event);
			void this.handleRunEvent(runId, event);
			return;
		}

		// Headless remote observer: running badge only.
		if (event.type === "agentStatus") {
			this.registry.updateStatus(runId, event.status);
			if (TERMINAL_STATUSES.has(event.status)) {
				this.registry.clear(sessionId);
			}
			this.handlers.onRunningSessionsChanged?.();
		}
	}

	private applyRemoteRunEventToUi(runId: string, event: WorkerToPanel): void {
		if (!this.registry.shouldUpdateUi(runId)) return;

		switch (event.type) {
			case "agentStatus": {
				browsergentStore.getState().agentStatusChanged(event.status, event.reason);
				if (
					event.status === "stopped" ||
					event.status === "error" ||
					event.status === "done"
				) {
					notifySkillsChanged();
				}
				if (event.status === "stopped") {
					this.handlers.onAgentStopped?.();
				}
				break;
			}
			case "agentMessage": {
				const { message } = event;
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
			case "agentTextDelta":
				appendStreamingDelta(event.messageId, event.text);
				break;
			case "agentMessageEnd":
				finalizeStreamingSignal(event.messageId);
				break;
			case "agentTrace":
				browsergentStore.getState().traceUpdated(event.entry);
				break;
			case "agentDiagnostic":
				browsergentStore.getState().diagnosticAdded(event.event);
				break;
			case "agentError": {
				const error = event.error;
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
		}
	}

	detachToHeadless(sessionId: string): void {
		this.registry.detach(sessionId);
		this.handlers.onRunningSessionsChanged?.();
	}

	attachForeground(sessionId: string): RunBridge {
		this.foregroundSessionId = sessionId;
		const state = this.registry.getBySession(sessionId);
		if (state) {
			this.registry.attach(sessionId);
			browsergentStore.getState().agentRunRequested(state.runId);
			browsergentStore
				.getState()
				.agentStatusChanged(state.status, undefined);
		} else {
			this.resetForegroundUi();
		}
		return this.ensureBridge(sessionId);
	}

	resetForegroundUi(): void {
		browsergentStore.getState().agentReset();
	}

	postToForeground(message: PanelToWorker): void {
		if (!this.foregroundSessionId) {
			throw new Error("No foreground session bound");
		}
		// Lazy: create agent-worker only when first message is posted (agentStart).
		this.ensureBridge(this.foregroundSessionId).post(message);
	}

	postToSession(sessionId: string, message: PanelToWorker): void {
		this.ensureBridge(sessionId).post(message);
	}

	stopForegroundRun(runId?: string): void {
		if (!this.foregroundSessionId) return;
		const bridge = this.bridges.get(this.foregroundSessionId);
		if (!bridge) return; // no worker → nothing to stop
		bridge.post({ type: "agentStop", runId });
	}

	dispose(): void {
		if (this.hosting === "offscreen") {
			this.bridges.clear();
			return;
		}
		for (const bridge of this.bridges.values()) {
			bridge.stop();
		}
		this.bridges.clear();
	}

	private async handleRunEvent(
		runId: string,
		event: WorkerToPanel,
	): Promise<void> {
		const state = this.registry.getByRunId(runId);
		if (!state) return;

		if (event.type === "agentStatus") {
			this.registry.updateStatus(runId, event.status);
			if (TERMINAL_STATUSES.has(event.status)) {
				await this.sink.flush(state.sessionId);
				this.registry.clear(state.sessionId);
				this.sink.invalidate(state.sessionId);
				this.handlers.onRunningSessionsChanged?.();
				if (
					this.hosting === "local" &&
					state.sessionId !== this.foregroundSessionId
				) {
					this.bridges.get(state.sessionId)?.stop();
					this.bridges.delete(state.sessionId);
				}
			}
		}

		const persistTypes = new Set([
			"agentMessage",
			"agentTextDelta",
			"agentMessageEnd",
			"agentTrace",
			"agentDiagnostic",
			"agentError",
		]);
		if (persistTypes.has(event.type)) {
			await this.sink.applyEvent(state.sessionId, event);
		}
	}
}