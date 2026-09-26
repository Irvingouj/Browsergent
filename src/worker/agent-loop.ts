import type {
	AgentHistoryEntry,
	AgentHistoryMessage,
	AgentModel,
	AgentRunResult,
} from "@pi-oxide/pi-host-web";
import { Agent } from "@pi-oxide/pi-host-web";
import type { BashCommandResult } from "../bash/types";
import { truncateSkillBody } from "../skills/resolve-skill-activations";
import { escapeXmlAttr } from "../skills/validate-skill-meta";
import type { CellResult } from "../types/extjs-utils";
import type {
	AgentDiagnosticEvent,
	AgentStatus,
	AgentTraceEntry,
} from "../types/messages";
import {
	isAgentHistoryMessage,
	repairAgentHistoryMessage,
	type SessionTranscriptEntry,
} from "../types/session-transcript";
import { streamLog } from "../utils/stream-logger";
import { createAgentTools } from "./agent-tools";
import { composeSystemPrompt } from "./anthropic";
import { getCurrentTraceId } from "./current-trace";
import type { FileOp, FileOpResult } from "./file-op-relay";
import { visibleAssistantText } from "./openai-responses-wire";
import type { RuntimeProvider } from "./provider-model";
import { createProviderModel } from "./provider-model";
import { isToolErrorEnvelope } from "./tool-error-result";

export function contextBudgetForModel(
	model: Pick<AgentModel, "contextWindow" | "maxTokens">,
): number {
	const contextWindow = model.contextWindow ?? 100_000;
	const outputReserve = model.maxTokens ?? 4_096;
	return Math.max(1, contextWindow - outputReserve);
}

export function computeToolEndTraceStatus(
	sdkStatus: string,
	_error: { message: string } | undefined,
	output: unknown,
): "error" | "done" {
	if (sdkStatus === "failed") return "error";
	if (typeof output === "string" && isToolErrorEnvelope(output)) return "error";
	return "done";
}

export interface AgentLoopCallbacks {
	onStatus: (status: AgentStatus, reason?: string) => void;
	onMessage: (
		kind: "user" | "assistant" | "system",
		text: string,
		id?: string,
	) => void;
	onHistoryEntry: (entry: SessionTranscriptEntry) => void;
	onTextDelta?: (messageId: string, text: string) => void;
	onMessageEnd?: (messageId: string) => void;
	onTrace: (entry: AgentTraceEntry) => void;
	onDiagnostic: (event: AgentDiagnosticEvent) => void;
	onError: (code: string, message: string) => void;
	runJs: (code: string) => Promise<CellResult>;
	getDocs: (format: "json" | "markdown") => Promise<string>;
	loadSkill: (skill: string, path?: string) => Promise<string>;
	fileOp: (op: FileOp) => Promise<FileOpResult>;
	bash: (command: string) => Promise<BashCommandResult>;
}

/**
 * Map pi-host SDK status → panel AgentStatus.
 *
 * CRITICAL: SDK emits `completed` on every `turn_end`, including after a tool
 * batch *before* hostContinueTurn streams the next assistant text. Mapping
 * that to terminal `done` clears SessionRunRegistry and drops all subsequent
 * agentMessage/agentTextDelta (chat shows tool only, status stuck).
 * True run completion is posted explicitly at the end of AgentLoop.run().
 */
export const STATUS_MAP: Record<string, AgentStatus> = {
	idle: "idle",
	loading: "loading",
	thinking: "waiting_for_model",
	calling_model: "waiting_for_model",
	running_tool: "executing_tool",
	saving: "running",
	// Mid-run turn_end / settled — NOT terminal. See comment above.
	completed: "running",
	aborted: "stopped",
	failed: "error",
};

export function mapAgentSdkStatus(
	state: string,
	opts?: { streamingAssistant?: boolean },
): AgentStatus {
	let mapped = STATUS_MAP[state] ?? "running";
	if (opts?.streamingAssistant && mapped === "waiting_for_model") {
		mapped = "running";
	}
	return mapped;
}

type PendingUserSteer = {
	text: string;
	messageId: string;
	callbacks: AgentLoopCallbacks;
};

export class AgentLoop {
	private agent: Agent | null = null;
	private aborted = false;
	private agentInitialized = false;
	private pendingUserSteers: PendingUserSteer[] = [];
	private stepCount = 0;
	private assistantMessageId: string | null = null;
	private hadOutput = false;
	// Conversation-scoped dedup: each skill steered at most once per run.
	private injectedSkills = new Set<string>();
	private historyLeafId: string | null = null;
	private historyTurnNumber = 0;
	private pendingUserEntries: Array<{
		entryId: string;
		displayText: string | null;
	}> = [];
	private pendingHistoryEntry: Omit<SessionTranscriptEntry, "message"> | null =
		null;

	private removePendingUserEntry(entryId: string): void {
		const index = this.pendingUserEntries.findIndex(
			(entry) => entry.entryId === entryId,
		);
		if (index >= 0) this.pendingUserEntries.splice(index, 1);
	}

	async run(
		sessionId: string,
		displayTask: string,
		userMessageId: string,
		resolvedTask: string,
		skillCatalog: string,
		provider: RuntimeProvider,
		history: AgentHistoryEntry[],
		callbacks: AgentLoopCallbacks,
	): Promise<void> {
		this.aborted = false;
		this.agentInitialized = false;
		this.pendingUserSteers = [];
		this.stepCount = 0;
		this.assistantMessageId = null;
		this.hadOutput = false;
		this.injectedSkills.clear();
		this.historyLeafId = history.at(-1)?.entryId ?? null;
		this.historyTurnNumber = history.reduce(
			(maximum, entry) => Math.max(maximum, entry.turnNumber),
			0,
		);
		this.pendingUserEntries = [];
		this.pendingHistoryEntry = null;

		callbacks.onStatus("loading");

		const model = createProviderModel(provider, callbacks.onDiagnostic);
		const tools = createAgentTools(
			callbacks.runJs,
			callbacks.getDocs,
			callbacks.loadSkill,
			callbacks.fileOp,
			callbacks.bash,
		);

		this.agent = new Agent({
			sessionId,
			model,
			tools,
			initialHistory: history,
			instructions: composeSystemPrompt(skillCatalog),
			context: {
				maxTokens: contextBudgetForModel(model),
				toolResultLimit: 50_000,
				summarize: true,
			},
		});

		// Wire SDK events → existing callbacks
		this.agent.on("text", (delta: string) => {
			if (!this.assistantMessageId) {
				this.assistantMessageId = crypto.randomUUID();
				callbacks.onMessage("assistant", "", this.assistantMessageId);
				// SDK stays on calling_model for the whole stream; promote to running
				// so the panel is not stuck on waiting_for_model while tokens flow.
				callbacks.onStatus("running");
			}
			this.hadOutput = true;
			callbacks.onTextDelta?.(this.assistantMessageId, delta);
			streamLog("agentloop.text_delta", {
				msgId: this.assistantMessageId?.slice(0, 8),
				len: delta.length,
			});
		});

		this.agent.on("status", (s: { state: string; message?: string }) => {
			if (!this.agentInitialized) {
				this.agentInitialized = true;
				const queuedSteers = this.pendingUserSteers.splice(0);
				for (const steer of queuedSteers) {
					void this.deliverUserSteer(
						steer.text,
						steer.messageId,
						steer.callbacks,
					);
				}
			}
			callbacks.onDiagnostic({
				kind: "agent_status",
				timestamp: Date.now(),
				state: s.state,
				message: s.message,
			});
			const mapped = mapAgentSdkStatus(s.state, {
				streamingAssistant: this.assistantMessageId !== null,
			});
			callbacks.onStatus(mapped, s.message);
		});

		this.agent.on(
			"toolStart",
			(t: { id: string; name: string; input: unknown }) => {
				this.stepCount++;
				this.hadOutput = true;
				callbacks.onStatus("executing_tool");
				callbacks.onTrace({
					id: t.id,
					step: this.stepCount,
					status: "running",
					toolName: t.name,
					toolInput: JSON.stringify(t.input).slice(0, 2000),
					timestamp: Date.now(),
					...(t.name === "run_js" && getCurrentTraceId()
						? { traceId: getCurrentTraceId() ?? undefined }
						: {}),
				});
			},
		);

		this.agent.on(
			"toolEnd",
			(t: {
				id: string;
				name: string;
				status: string;
				output?: unknown;
				error?: { message: string };
			}) => {
				const rawOutput = t.error
					? t.error.message
					: typeof t.output === "string"
						? t.output
						: JSON.stringify(t.output);
				const resultText = rawOutput.slice(0, 8000);
				const traceStatus = computeToolEndTraceStatus(
					t.status,
					t.error,
					t.output,
				);
				callbacks.onTrace({
					id: t.id,
					step: this.stepCount,
					status: traceStatus,
					toolName: t.name,
					result: resultText,
					timestamp: Date.now(),
					...(t.name === "run_js" && getCurrentTraceId()
						? { traceId: getCurrentTraceId() ?? undefined }
						: {}),
				});
				callbacks.onStatus("running");
			},
		);

		this.agent.on("messageEnd", (msg) => {
			const text = visibleAssistantText(msg.content);
			let entryId: string;
			let displayText: string | null = null;
			let turnNumber = this.historyTurnNumber;

			switch (msg.role) {
				case "user": {
					const pending = this.pendingUserEntries.shift();
					entryId = pending?.entryId ?? crypto.randomUUID();
					displayText = pending?.displayText ?? null;
					this.historyTurnNumber++;
					turnNumber = this.historyTurnNumber;
					break;
				}
				case "assistant":
					entryId = this.assistantMessageId ?? crypto.randomUUID();
					displayText = text || null;
					if (text && !this.assistantMessageId) {
						callbacks.onMessage("assistant", text, entryId);
					}
					if (displayText !== null) callbacks.onMessageEnd?.(entryId);
					this.assistantMessageId = null;
					break;
				case "tool_result":
					entryId = crypto.randomUUID();
					break;
			}

			this.pendingHistoryEntry = {
				entryId,
				parentId: this.historyLeafId,
				turnNumber,
				displayText,
			};
		});

		this.agent.on("historyMessage", (raw: AgentHistoryMessage) => {
			const message = isAgentHistoryMessage(raw)
				? raw
				: repairAgentHistoryMessage(raw);
			if (!message) return;
			const pending = this.pendingHistoryEntry;
			const entry: SessionTranscriptEntry = {
				entryId: pending?.entryId ?? crypto.randomUUID(),
				parentId: pending?.parentId ?? this.historyLeafId,
				turnNumber: pending?.turnNumber ?? this.historyTurnNumber,
				displayText: pending?.displayText ?? null,
				message,
			};
			this.pendingHistoryEntry = null;
			this.historyLeafId = entry.entryId;
			callbacks.onHistoryEntry(entry);
		});

		this.agent.on("error", (err: { code: string; message: string }) => {
			callbacks.onError(err.code, err.message);
		});

		callbacks.onStatus("running");
		this.pendingUserEntries.push({
			entryId: userMessageId,
			displayText: displayTask,
		});

		try {
			const result: AgentRunResult = await this.agent.run(resolvedTask);
			callbacks.onDiagnostic({
				kind: "agent_run_result",
				timestamp: Date.now(),
				status: result.status,
				text: result.text,
				toolCalls: result.toolCalls.map((tool) => ({
					id: tool.id,
					name: tool.name,
					input: tool.input,
					output: tool.output,
					status: tool.status,
					error: tool.error
						? { code: tool.error.code, message: tool.error.message }
						: undefined,
				})),
				error: result.error
					? { code: result.error.code, message: result.error.message }
					: undefined,
			});

			if (result.status === "aborted" || this.aborted) {
				callbacks.onStatus("stopped", "Stopped by user");
			} else if (result.status === "failed") {
				const errMsg = result.error?.message ?? "Agent run failed";
				callbacks.onError("agent_error", errMsg);
				callbacks.onStatus("error", errMsg);
			} else if (result.status === "completed" && !this.hadOutput) {
				// Guard against Agent.run() returning "completed" with no output
				// when the LLM stream fails silently.
				callbacks.onError(
					"agent_error",
					"LLM request failed — no response received",
				);
				callbacks.onStatus(
					"error",
					"LLM request failed — no response received",
				);
			} else {
				callbacks.onStatus("done");
			}
		} catch (err) {
			if (this.aborted) {
				callbacks.onStatus("stopped", "Stopped by user");
			} else {
				const message = err instanceof Error ? err.message : String(err);
				callbacks.onError("agent_error", message);
				callbacks.onStatus("error", message);
			}
		}

		// Cleanup
		try {
			this.agent.dispose();
		} catch {
			// ignore
		}
		this.agent = null;
	}

	stop(): void {
		this.aborted = true;
		this.pendingUserSteers = [];
		try {
			this.agent?.stop();
		} catch {
			// ignore — agent may already be finished
		}
	}

	/**
	 * Steer a navigation-triggered skill into the running turn. Queues, never
	 * interrupts — the message drains at the next continue_turn. No-op if the
	 * skill was already injected in this run, or if the agent isn't running.
	 */
	async steerSkill(
		skillName: string,
		skillBody: string,
		url: string,
		callbacks: AgentLoopCallbacks,
	): Promise<void> {
		if (!this.agent || this.aborted) return;
		if (this.injectedSkills.has(skillName)) return;
		this.injectedSkills.add(skillName);
		const text = `<navigation_trigger url="${escapeXmlAttr(url)}"><skill name="${escapeXmlAttr(skillName)}">${truncateSkillBody(skillBody)}</skill></navigation_trigger>`;
		const entryId = crypto.randomUUID();
		this.pendingUserEntries.push({ entryId, displayText: null });
		try {
			await this.agent.steer({
				text,
				source: {
					kind: "navigation" as const,
					url,
					matchedSkills: [skillName],
				},
			});
			streamLog("agentloop.steer_skill", { skillName, url });
		} catch (error: unknown) {
			this.removePendingUserEntry(entryId);
			this.injectedSkills.delete(skillName);
			const message = error instanceof Error ? error.message : String(error);
			callbacks.onMessage(
				"system",
				`Couldn't inject navigation skill: ${message}`,
			);
		}
	}

	/**
	 * Steer a user-typed follow-up into the running turn. Queues, never
	 * interrupts — same SDK path as steerSkill. Unlike skills, no dedup:
	 * users steer repeatedly. Surfaces the text as a user message bubble so
	 * the human sees what they injected.
	 */
	async steerUser(
		text: string,
		messageId: string,
		callbacks: AgentLoopCallbacks,
	): Promise<void> {
		// Panel already showed the user bubble optimistically (handleSteer).
		// Do not emit a second user message here.
		if (!this.agent || this.aborted) {
			callbacks.onMessage(
				"system",
				"Couldn't deliver steer mid-action: agent not running",
			);
			return;
		}
		if (!this.agentInitialized) {
			this.pendingUserSteers.push({ text, messageId, callbacks });
			return;
		}
		await this.deliverUserSteer(text, messageId, callbacks);
	}

	private async deliverUserSteer(
		text: string,
		messageId: string,
		callbacks: AgentLoopCallbacks,
	): Promise<void> {
		if (!this.agent || this.aborted) return;
		try {
			this.pendingUserEntries.push({ entryId: messageId, displayText: text });
			await this.agent.steer({ text, source: { kind: "user" as const } });
			streamLog("agentloop.steer_user", { len: text.length });
		} catch (err: unknown) {
			this.removePendingUserEntry(messageId);
			// steer() can reject if the run ends between the guard and the call.
			// The bubble stays — the user said it; surface the failure, don't drop it.
			const message = err instanceof Error ? err.message : String(err);
			callbacks.onMessage(
				"system",
				`Couldn't deliver steer mid-action: ${message}`,
			);
		}
	}

	reset(): void {
		this.aborted = true;
		this.pendingUserSteers = [];
		this.agent?.stop();
		if (this.agent) {
			try {
				this.agent.reset();
				this.agent.dispose();
			} catch {
				// ignore
			}
		}
		this.agent = null;
		this.injectedSkills.clear();
	}
}
