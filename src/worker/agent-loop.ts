import { Agent } from "@pi-oxide/pi-host-web";
import type { AgentRunResult } from "@pi-oxide/pi-host-web";
import type { PersistData } from "@pi-oxide/pi-host-web/raw";
import type { LuaRunResult } from "@pi-oxide/extension-lua";
import type { AgentStatus, AgentTraceEntry } from "../types/messages";
import type { AnthropicConfig } from "./anthropic";
import { SYSTEM_PROMPT } from "./anthropic";
import { createAnthropicModel } from "./anthropic-model";
import { createAgentTools } from "./agent-tools";

export interface AgentLoopCallbacks {
	onStatus: (status: AgentStatus, reason?: string) => void;
	onMessage: (kind: "user" | "assistant" | "system", text: string) => void;
	onTextDelta?: (messageId: string, text: string) => void;
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

	async run(
		task: string,
		config: AnthropicConfig,
		callbacks: AgentLoopCallbacks,
		priorMessages: Array<{ role: "user" | "assistant"; content: string }> = [],
		priorPersistData?: PersistData,
	): Promise<{
		messages: Array<{ role: "user" | "assistant"; content: string }>;
		persistData: PersistData | null;
	}> {
		this.aborted = false;
		this.stepCount = 0;

		callbacks.onStatus("loading");

		const model = createAnthropicModel(config);
		const tools = createAgentTools(callbacks.runLua);

		this.agent = new Agent({
			sessionId: `session-${Date.now()}`,
			model,
			tools,
			instructions: SYSTEM_PROMPT,
			context: {
				maxTokens: 100_000,
				toolResultLimit: 50_000,
				summarize: true,
			},
		});

		const messages: Array<{ role: "user" | "assistant"; content: string }> = [
			...priorMessages,
			{ role: "user", content: task },
		];

		// Wire SDK events → existing callbacks
		this.agent.on("text", (delta: string) => {
			callbacks.onTextDelta?.(Date.now().toString(), delta);
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
				if (text) {
					messages.push({ role: "assistant", content: text });
				}
			}
		});

		this.agent.on("error", (err: { code: string; message: string }) => {
			callbacks.onError(err.code, err.message);
		});

		callbacks.onStatus("running");
		callbacks.onMessage("user", task);

		let persistData: PersistData | null = null;

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

		return { messages, persistData };
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
