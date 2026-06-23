import type { AgentRunResult } from "@pi-oxide/pi-host-web";
import { Agent, indexedDbStore } from "@pi-oxide/pi-host-web";
import type { CellResult } from "../types/extjs-utils";
import type {
	AgentDiagnosticEvent,
	AgentStatus,
	AgentTraceEntry,
} from "../types/messages";
import { streamLog } from "../utils/stream-logger";
import { createAgentTools } from "./agent-tools";
import type { AnthropicConfig } from "./anthropic";
import { composeSystemPrompt } from "./anthropic";
import { createAnthropicModel } from "./anthropic-model";
import type { FileOp, FileOpResult } from "./file-op-relay";
import { isToolErrorEnvelope } from "./tool-error-result";
import { getCurrentTraceId } from "./current-trace";

function isTextContentBlock(c: {
	type: string;
	text?: string;
}): c is { type: "text"; text: string } {
	return c.type === "text" && typeof c.text === "string";
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
	onTextDelta?: (messageId: string, text: string) => void;
	onMessageEnd?: (messageId: string) => void;
	onTrace: (entry: AgentTraceEntry) => void;
	onDiagnostic: (event: AgentDiagnosticEvent) => void;
	onError: (code: string, message: string) => void;
	runJs: (code: string) => Promise<CellResult>;
	getDocs: (format: "json" | "markdown") => Promise<string>;
	loadSkill: (skill: string, path?: string) => Promise<string>;
	fileOp: (op: FileOp) => Promise<FileOpResult>;
}

const STATUS_MAP: Record<string, AgentStatus> = {
	idle: "idle",
	loading: "loading",
	thinking: "waiting_for_model",
	calling_model: "waiting_for_model",
	running_tool: "executing_tool",
	saving: "running",
	completed: "done",
	aborted: "stopped",
	failed: "error",
};

export class AgentLoop {
	private agent: Agent | null = null;
	private aborted = false;
	private stepCount = 0;
	private assistantMessageId: string | null = null;
	private hadOutput = false;

	async run(
		sessionId: string,
		displayTask: string,
		resolvedTask: string,
		skillCatalog: string,
		config: AnthropicConfig,
		callbacks: AgentLoopCallbacks,
	): Promise<void> {
		this.aborted = false;
		this.stepCount = 0;
		this.assistantMessageId = null;
		this.hadOutput = false;

		callbacks.onStatus("loading");

		const model = createAnthropicModel(config, callbacks.onDiagnostic);
		const tools = createAgentTools(
			callbacks.runJs,
			callbacks.getDocs,
			callbacks.loadSkill,
			callbacks.fileOp,
		);

		this.agent = new Agent({
			sessionId,
			model,
			tools,
			store: indexedDbStore(),
			instructions: composeSystemPrompt(skillCatalog),
			context: {
				maxTokens: 1_000_000,
				toolResultLimit: 50_000,
				summarize: true,
			},
		});

		// Wire SDK events → existing callbacks
		this.agent.on("text", (delta: string) => {
			if (!this.assistantMessageId) {
				this.assistantMessageId = crypto.randomUUID();
				callbacks.onMessage("assistant", "", this.assistantMessageId);
			}
			this.hadOutput = true;
			callbacks.onTextDelta?.(this.assistantMessageId, delta);
			streamLog("agentloop.text_delta", {
				msgId: this.assistantMessageId?.slice(0, 8),
				len: delta.length,
			});
		});

		this.agent.on("status", (s: { state: string; message?: string }) => {
			callbacks.onDiagnostic({
				kind: "agent_status",
				timestamp: Date.now(),
				state: s.state,
				message: s.message,
			});
			const mapped = STATUS_MAP[s.state] ?? "running";
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

		this.agent.on(
			"messageEnd",
			(msg: {
				role: string;
				content: Array<{ type: string; text?: string }>;
			}) => {
				if (msg.role === "assistant") {
					const text = msg.content
						.filter(isTextContentBlock)
						.map((c) => c.text)
						.join("");
					if (text && !this.assistantMessageId) {
						callbacks.onMessage("assistant", text);
					}
					if (this.assistantMessageId) {
						callbacks.onMessageEnd?.(this.assistantMessageId);
					}
					this.assistantMessageId = null;
				}
			},
		);

		this.agent.on("error", (err: { code: string; message: string }) => {
			callbacks.onError(err.code, err.message);
		});

		callbacks.onStatus("running");
		callbacks.onMessage("user", displayTask);

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
		try {
			this.agent?.stop();
		} catch {
			// ignore — agent may already be finished
		}
	}

	reset(): void {
		this.aborted = true;
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
	}
}
