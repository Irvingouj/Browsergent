import type {
	BrowsergentErrorCode,
} from "../errors/browsergent-error";
import type {
	AgentStatus,
	AgentTraceEntry,
	ChatMessage,
	WorkerToPanel,
} from "../types/messages";

const AGENT_STATUSES: readonly AgentStatus[] = [
	"idle",
	"loading",
	"running",
	"waiting_for_model",
	"executing_tool",
	"done",
	"stopped",
	"error",
];

function isObject(msg: unknown): msg is Record<string, unknown> {
	return typeof msg === "object" && msg !== null;
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function isNumber(value: unknown): value is number {
	return typeof value === "number";
}

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === "string";
}

function isChatMessage(msg: unknown): msg is ChatMessage {
	if (!isObject(msg)) return false;
	if (!isString(msg.kind)) return false;
	if (msg.kind !== "user" && msg.kind !== "assistant" && msg.kind !== "system")
		return false;
	if (!isString(msg.id)) return false;
	if (!isString(msg.text)) return false;
	if (!isNumber(msg.timestamp)) return false;
	return true;
}

function isAgentTraceEntry(entry: unknown): entry is AgentTraceEntry {
	if (!isObject(entry)) return false;
	if (!isString(entry.id)) return false;
	if (!isNumber(entry.step)) return false;
	if (!isString(entry.status)) return false;
	if (
		entry.status !== "running" &&
		entry.status !== "done" &&
		entry.status !== "error"
	)
		return false;
	if (!isString(entry.toolName)) return false;
	if ("toolInput" in entry && !isOptionalString(entry.toolInput)) return false;
	if ("result" in entry && !isOptionalString(entry.result)) return false;
	if (!isNumber(entry.timestamp)) return false;
	return true;
}

const BROWSERGENT_ERROR_CODES: readonly string[] = [
	"E_NO_API_KEY",
	"E_BAD_SETTINGS",
	"E_WORKER_CRASH",
	"E_LLM_REQUEST",
	"E_LUA_COMPILE",
	"E_LUA_RUNTIME",
	"E_LUA_TIMEOUT",
	"E_LUA_RELAY",
	"E_CHROME_PERMISSION",
	"E_CONTENT_SCRIPT",
	"E_PROTOCOL",
	"E_UNKNOWN",
];

export function isBrowsergentError(
	err: unknown,
): err is { code: BrowsergentErrorCode; message: string; details?: Record<string, unknown> } {
	if (!isObject(err)) return false;
	if (!isString(err.code)) return false;
	if (!BROWSERGENT_ERROR_CODES.includes(err.code)) return false;
	if (!isString(err.message)) return false;
	if ("details" in err && err.details !== undefined) {
		if (!isObject(err.details)) return false;
	}
	return true;
}

export function isWorkerReady(msg: unknown): msg is { type: "workerReady" } {
	return isObject(msg) && msg.type === "workerReady";
}

export function isAgentStatus(msg: unknown): msg is {
	type: "agentStatus";
	runId: string;
	status: AgentStatus;
	reason?: string;
} {
	if (!isObject(msg)) return false;
	if (msg.type !== "agentStatus") return false;
	if (!isString(msg.runId)) return false;
	if (!isString(msg.status)) return false;
	if (!AGENT_STATUSES.includes(msg.status as AgentStatus)) return false;
	if ("reason" in msg && !isOptionalString(msg.reason)) return false;
	return true;
}

export function isAgentMessage(
	msg: unknown,
): msg is { type: "agentMessage"; runId: string; message: ChatMessage } {
	if (!isObject(msg)) return false;
	if (msg.type !== "agentMessage") return false;
	if (!isString(msg.runId)) return false;
	if (!isChatMessage(msg.message)) return false;
	return true;
}

export function isAgentTextDelta(msg: unknown): msg is {
	type: "agentTextDelta";
	runId: string;
	messageId: string;
	text: string;
} {
	if (!isObject(msg)) return false;
	if (msg.type !== "agentTextDelta") return false;
	if (!isString(msg.runId)) return false;
	if (!isString(msg.messageId)) return false;
	if (!isString(msg.text)) return false;
	return true;
}

export function isAgentTrace(
	msg: unknown,
): msg is { type: "agentTrace"; runId: string; entry: AgentTraceEntry } {
	if (!isObject(msg)) return false;
	if (msg.type !== "agentTrace") return false;
	if (!isString(msg.runId)) return false;
	if (!isAgentTraceEntry(msg.entry)) return false;
	return true;
}

export function isAgentError(msg: unknown): msg is {
	type: "agentError";
	runId: string;
	error: { code: string; message: string; details?: Record<string, unknown> };
} {
	if (!isObject(msg)) return false;
	if (msg.type !== "agentError") return false;
	if (!isString(msg.runId)) return false;
	if (!isBrowsergentError(msg.error)) return false;
	return true;
}

export function isConversationMessage(
	msg: unknown,
): msg is { role: "user" | "assistant"; content: string } {
	if (!isObject(msg)) return false;
	if (msg.role !== "user" && msg.role !== "assistant") return false;
	if (!isString(msg.content)) return false;
	return true;
}

export function isAgentHistory(msg: unknown): msg is {
	type: "agentHistory";
	runId: string;
	messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
	if (!isObject(msg)) return false;
	if (msg.type !== "agentHistory") return false;
	if (!isString(msg.runId)) return false;
	if (!Array.isArray(msg.messages)) return false;
	if (!msg.messages.every(isConversationMessage)) return false;
	return true;
}

export function isAgentSessionState(msg: unknown): msg is {
	type: "agentSessionState";
	runId: string;
	sessionState: unknown;
} {
	// SdkSessionState is an opaque SDK type; we only validate the envelope here.
	if (!isObject(msg)) return false;
	if (msg.type !== "agentSessionState") return false;
	if (!isString(msg.runId)) return false;
	if (!isObject(msg.sessionState)) return false;
	return true;
}

export function isLuaOutput(
	msg: unknown,
): msg is { type: "luaOutput"; id: string; output: string } {
	if (!isObject(msg)) return false;
	if (msg.type !== "luaOutput") return false;
	if (!isString(msg.id)) return false;
	if (!isString(msg.output)) return false;
	return true;
}

export function isLuaError(
	msg: unknown,
): msg is { type: "luaError"; id: string; error: string } {
	if (!isObject(msg)) return false;
	if (msg.type !== "luaError") return false;
	if (!isString(msg.id)) return false;
	if (!isString(msg.error)) return false;
	return true;
}

export function isLuaRunRequest(
	msg: unknown,
): msg is { type: "luaRunRequest"; id: string; code: string } {
	if (!isObject(msg)) return false;
	if (msg.type !== "luaRunRequest") return false;
	if (!isString(msg.id)) return false;
	if (!isString(msg.code)) return false;
	return true;
}

export function isWorkerToPanel(msg: unknown): msg is WorkerToPanel {
	return (
		isWorkerReady(msg) ||
		isAgentStatus(msg) ||
		isAgentMessage(msg) ||
		isAgentTextDelta(msg) ||
		isAgentTrace(msg) ||
		isAgentError(msg) ||
		isAgentHistory(msg) ||
		isAgentSessionState(msg) ||
		isLuaOutput(msg) ||
		isLuaError(msg) ||
		isLuaRunRequest(msg)
	);
}
