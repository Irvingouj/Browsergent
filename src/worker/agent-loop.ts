import { Agent, indexedDbStore } from "@pi-oxide/pi-host-web";
import type { AgentRunResult } from "@pi-oxide/pi-host-web";
import type { LuaRunResult } from "../types/lua-utils";
import type { AgentStatus, AgentTraceEntry } from "../types/messages";
import type { AnthropicConfig } from "./anthropic";
import { SYSTEM_PROMPT } from "./anthropic";
import { createAnthropicModel } from "./anthropic-model";
import { createAgentTools } from "./agent-tools";
import { streamLog } from "../utils/stream-logger";

export interface AgentLoopCallbacks {
	onStatus: (status: AgentStatus, reason?: string) => void;
	onMessage: (kind: "user" | "assistant" | "system", text: string, id?: string) => void;
	onTextDelta?: (messageId: string, text: string) => void;
	onMessageEnd?: (messageId: string) => void;
	onTrace: (entry: AgentTraceEntry) => void;
	onError: (code: string, message: string) => void;
	runLua: (code: string) => Promise<LuaRunResult>;
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
	private assistantText = "";

	async run(
		sessionId: string,
		task: string,
		config: AnthropicConfig,
		callbacks: AgentLoopCallbacks,
	): Promise<void> {
		this.aborted = false;
		this.stepCount = 0;
		this.assistantMessageId = null;
		this.assistantText = "";

		callbacks.onStatus("loading");

		const model = createAnthropicModel(config);
		const tools = createAgentTools(callbacks.runLua);

		this.agent = new Agent({
			sessionId,
			model,
			tools,
			store: indexedDbStore(),
			instructions: SYSTEM_PROMPT,
			context: {
				maxTokens: 100_000,
				toolResultLimit: 50_000,
				summarize: true,
			},
		});

		// Wire SDK events → existing callbacks
		this.agent.on("text", (delta: string) => {
			if (!this.assistantMessageId) {
				this.assistantMessageId = crypto.randomUUID();
				this.assistantText = "";
				callbacks.onMessage("assistant", "", this.assistantMessageId);
			}
			this.assistantText += delta;
			callbacks.onTextDelta?.(this.assistantMessageId, delta);
			streamLog("agentloop.text_delta", { msgId: this.assistantMessageId?.slice(0, 8), len: delta.length });
		});

		this.agent.on("status", (s: { state: string; message?: string }) => {
			const mapped = STATUS_MAP[s.state] ?? "running";
			callbacks.onStatus(mapped, s.message);
		});

		this.agent.on("toolStart", (t: { id: string; name: string; input: unknown }) => {
			this.stepCount++;
			callbacks.onStatus("executing_tool");
			callbacks.onTrace({
				id: t.id,
				step: this.stepCount,
				status: "running",
				toolName: t.name,
				toolInput: JSON.stringify(t.input).slice(0, 2000),
				timestamp: Date.now(),
			});
		});

		this.agent.on("toolEnd", (t: { id: string; name: string; status: string; output?: unknown; error?: { message: string } }) => {
			const resultText = t.error
				? t.error.message
				: typeof t.output === "string"
					? t.output.slice(0, 8000)
					: JSON.stringify(t.output).slice(0, 8000);
			callbacks.onTrace({
				id: t.id,
				step: this.stepCount,
				status: t.status === "failed" ? "error" : "done",
				toolName: t.name,
				result: resultText,
				timestamp: Date.now(),
			});
			callbacks.onStatus("running");
		});

		this.agent.on("messageEnd", (msg: { role: string; content: Array<{ type: string; text?: string }> }) => {
			if (msg.role === "assistant") {
				const text = msg.content
					.filter((c): c is { type: "text"; text: string } => c.type === "text")
					.map((c) => c.text)
					.join("");
				if (text && !this.assistantMessageId) {
					callbacks.onMessage("assistant", text);
				}
				if (this.assistantMessageId) {
					callbacks.onMessageEnd?.(this.assistantMessageId);
				}
				this.assistantMessageId = null;
				this.assistantText = "";
			}
		});

		this.agent.on("error", (err: { code: string; message: string }) => {
			callbacks.onError(err.code, err.message);
		});

		callbacks.onStatus("running");
		callbacks.onMessage("user", task);

		try {
			const result: AgentRunResult = await this.agent.run(task);

			if (result.status === "aborted" || this.aborted) {
				callbacks.onStatus("stopped", "Stopped by user");
			} else if (result.status === "failed") {
				const errMsg = result.error?.message ?? "Agent run failed";
				callbacks.onError("agent_error", errMsg);
				callbacks.onStatus("error", errMsg);
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
		this.agent?.stop();
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
