import type { BrowsergentErrorCode } from "../errors/browsergent-error";
import type { FileOp, FileOpResult } from "../worker/file-op-relay";
import type {
	AgentDiagnosticEvent,
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

export function isChatMessage(msg: unknown): msg is ChatMessage {
	if (!isObject(msg)) return false;
	if (!isString(msg.kind)) return false;
	if (msg.kind !== "user" && msg.kind !== "assistant" && msg.kind !== "system")
		return false;
	if (!isString(msg.id)) return false;
	if (!isString(msg.text)) return false;
	if (!isNumber(msg.timestamp)) return false;
	return true;
}

export function isAgentTraceEntry(entry: unknown): entry is AgentTraceEntry {
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

export function isBrowsergentError(err: unknown): err is {
	code: BrowsergentErrorCode;
	message: string;
	details?: Record<string, unknown>;
} {
	if (!isObject(err)) return false;
	if (!isString(err.code)) return false;
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

export function isAgentDiagnosticEvent(
	event: unknown,
): event is AgentDiagnosticEvent {
	if (!isObject(event) || !isString(event.kind) || !isNumber(event.timestamp))
		return false;
	switch (event.kind) {
		case "provider_request":
			return "body" in event;
		case "provider_sse_event":
			return isString(event.eventType) && isString(event.data);
		case "provider_sse_remainder":
			return isString(event.data);
		case "model_request":
			return (
				isString(event.instructions) &&
				Array.isArray(event.messages) &&
				Array.isArray(event.tools)
			);
		case "model_response":
			return (
				isString(event.providerStopReason) &&
				isString(event.sdkStopReason) &&
				Array.isArray(event.content)
			);
		case "agent_status":
			return (
				isString(event.state) &&
				(!("message" in event) || isOptionalString(event.message))
			);
		case "agent_run_result":
			return (
				isString(event.status) &&
				isString(event.text) &&
				Array.isArray(event.toolCalls)
			);
		default:
			return false;
	}
}

export function isAgentDiagnostic(msg: unknown): msg is {
	type: "agentDiagnostic";
	runId: string;
	event: AgentDiagnosticEvent;
} {
	return (
		isObject(msg) &&
		msg.type === "agentDiagnostic" &&
		isString(msg.runId) &&
		isAgentDiagnosticEvent(msg.event)
	);
}

export function isAgentMessageEnd(msg: unknown): msg is {
	type: "agentMessageEnd";
	runId: string;
	messageId: string;
} {
	if (!isObject(msg)) return false;
	if (msg.type !== "agentMessageEnd") return false;
	if (!isString(msg.runId)) return false;
	if (!isString(msg.messageId)) return false;
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

export function isExtjsOutput(
	msg: unknown,
): msg is { type: "extjsOutput"; id: string; output: string } {
	if (!isObject(msg)) return false;
	if (msg.type !== "extjsOutput") return false;
	if (!isString(msg.id)) return false;
	if (!isString(msg.output)) return false;
	return true;
}

export function isExtjsError(
	msg: unknown,
): msg is { type: "extjsError"; id: string; error: string } {
	if (!isObject(msg)) return false;
	if (msg.type !== "extjsError") return false;
	if (!isString(msg.id)) return false;
	if (!isString(msg.error)) return false;
	return true;
}

export function isExtjsRunRequest(
	msg: unknown,
): msg is { type: "extjsRunRequest"; id: string; code: string } {
	if (!isObject(msg)) return false;
	if (msg.type !== "extjsRunRequest") return false;
	if (!isString(msg.id)) return false;
	if (!isString(msg.code)) return false;
	return true;
}

export function isExtjsDocsRequest(msg: unknown): msg is {
	type: "extjsDocsRequest";
	id: string;
	format: "json" | "markdown";
} {
	if (!isObject(msg)) return false;
	if (msg.type !== "extjsDocsRequest") return false;
	if (!isString(msg.id)) return false;
	if (msg.format !== "json" && msg.format !== "markdown") return false;
	return true;
}

export function isExtjsDocsResult(
	msg: unknown,
): msg is { type: "extjsDocsResult"; id: string; docs: string } {
	if (!isObject(msg)) return false;
	if (msg.type !== "extjsDocsResult") return false;
	if (!isString(msg.id)) return false;
	if (!isString(msg.docs)) return false;
	return true;
}

export function isExtjsDocsError(
	msg: unknown,
): msg is { type: "extjsDocsError"; id: string; error: string } {
	if (!isObject(msg)) return false;
	if (msg.type !== "extjsDocsError") return false;
	if (!isString(msg.id)) return false;
	if (!isString(msg.error)) return false;
	return true;
}

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

export function isLoadSkillRequest(msg: unknown): msg is {
	type: "loadSkillRequest";
	id: string;
	skill: string;
	path?: string;
	activatedSkills?: string[];
} {
	if (!isObject(msg)) return false;
	if (msg.type !== "loadSkillRequest") return false;
	if (!isString(msg.id)) return false;
	if (!isString(msg.skill)) return false;
	if (msg.path !== undefined && !isString(msg.path)) return false;
	if (
		msg.activatedSkills !== undefined &&
		!isStringArray(msg.activatedSkills)
	) {
		return false;
	}
	return true;
}

export function isLoadSkillResult(
	msg: unknown,
): msg is { type: "loadSkillResult"; id: string; content: string } {
	if (!isObject(msg)) return false;
	if (msg.type !== "loadSkillResult") return false;
	if (!isString(msg.id)) return false;
	if (!isString(msg.content)) return false;
	return true;
}

export function isLoadSkillError(
	msg: unknown,
): msg is { type: "loadSkillError"; id: string; error: string } {
	if (!isObject(msg)) return false;
	if (msg.type !== "loadSkillError") return false;
	if (!isString(msg.id)) return false;
	if (!isString(msg.error)) return false;
	return true;
}

function isValidFileOp(op: unknown): op is FileOp {
	if (!isObject(op)) return false;
	const o = op as Record<string, unknown>;
	if (o.op !== "list" && o.op !== "read" && o.op !== "edit" && o.op !== "delete")
		return false;
	if (o.op === "list") {
		if (o.prefix !== undefined && typeof o.prefix !== "string") return false;
		return true;
	}
	if (o.op === "read" || o.op === "delete") {
		return typeof o.path === "string";
	}
	// edit
	return (
		typeof o.path === "string" &&
		typeof o.oldString === "string" &&
		typeof o.newString === "string" &&
		(o.replaceAll === undefined || typeof o.replaceAll === "boolean")
	);
}

function isValidFileOpResult(result: unknown): result is FileOpResult {
	if (!isObject(result)) return false;
	const r = result as Record<string, unknown>;
	if (r.op !== "list" && r.op !== "read" && r.op !== "edit" && r.op !== "delete")
		return false;
	if (r.op === "list") return Array.isArray(r.files);
	if (r.op === "read") {
		return (
			typeof r.content === "string" &&
			typeof r.bytes === "number" &&
			typeof r.truncated === "boolean"
		);
	}
	if (r.op === "edit") {
		return typeof r.occurrences === "number" && typeof r.bytes === "number";
	}
	return true; // delete has no extra fields
}

export function isFileOpRequest(msg: unknown): msg is {
	type: "fileOpRequest";
	id: string;
	sessionId: string;
	op: FileOp;
} {
	if (!isObject(msg)) return false;
	if (msg.type !== "fileOpRequest") return false;
	if (!isString(msg.id)) return false;
	if (!isString(msg.sessionId)) return false;
	if (!isValidFileOp(msg.op)) return false;
	return true;
}

export function isFileOpResult(msg: unknown): msg is {
	type: "fileOpResult";
	id: string;
	result: FileOpResult;
} {
	if (!isObject(msg)) return false;
	if (msg.type !== "fileOpResult") return false;
	if (!isString(msg.id)) return false;
	if (msg.result === undefined) return false;
	if (!isValidFileOpResult(msg.result)) return false;
	return true;
}

export function isFileOpError(
	msg: unknown,
): msg is { type: "fileOpError"; id: string; error: string } {
	if (!isObject(msg)) return false;
	if (msg.type !== "fileOpError") return false;
	if (!isString(msg.id)) return false;
	if (!isString(msg.error)) return false;
	return true;
}

export function isWorkerToPanel(msg: unknown): msg is WorkerToPanel {
	return (
		isWorkerReady(msg) ||
		isAgentStatus(msg) ||
		isAgentMessage(msg) ||
		isAgentTextDelta(msg) ||
		isAgentTrace(msg) ||
		isAgentDiagnostic(msg) ||
		isAgentMessageEnd(msg) ||
		isAgentError(msg) ||
		isExtjsOutput(msg) ||
		isExtjsError(msg) ||
		isExtjsRunRequest(msg) ||
		isExtjsDocsRequest(msg) ||
		isLoadSkillRequest(msg) ||
		isFileOpRequest(msg)
	);
}
