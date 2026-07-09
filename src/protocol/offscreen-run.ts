import type { AgentRunStatus } from "../state/slices/agent-slice";
import type { PanelToWorker, WorkerToPanel } from "../types/messages";

/** Worker→panel relay requests forwarded to a live sidepanel for extjs/files. */
export type OffscreenPanelRelayRequest = Extract<
	WorkerToPanel,
	| { type: "extjsRunRequest" }
	| { type: "extjsDocsRequest" }
	| { type: "fileOpRequest" }
>;

export type OffscreenRunCommandMessage = {
	type: "offscreenRunCommand";
	sessionId: string;
	windowId: number;
	message: PanelToWorker;
};

export type OffscreenRunEventMessage = {
	type: "offscreenRunEvent";
	sessionId: string;
	event: WorkerToPanel;
};

export type OffscreenRunStateEntry = {
	sessionId: string;
	runId: string;
	status: AgentRunStatus;
	windowId: number;
};

export type OffscreenRunStateMessage = {
	type: "offscreenRunState";
	runs: OffscreenRunStateEntry[];
};

export type OffscreenQueryRunsMessage = {
	type: "offscreenQueryRuns";
	sessionIds?: string[];
};

export type OffscreenAdoptRunsMessage = {
	type: "offscreenAdoptRuns";
	sessionIds: string[];
	windowId: number;
};

export type OffscreenPanelRelayMessage = {
	type: "offscreenPanelRelay";
	windowId: number;
	requestId: string;
	sessionId?: string;
	message: OffscreenPanelRelayRequest;
};

export type OffscreenPanelRelayResponse = {
	type: "offscreenPanelRelayResponse";
	requestId: string;
	message: PanelToWorker;
};

/** Relay run events from a panel worker to other panels (merge subscribe). */
export type SessionRunRelayMessage = {
	type: "sessionRunRelay";
	sessionId: string;
	event: WorkerToPanel;
};

export function isSessionRunRelayMessage(
	msg: unknown,
): msg is SessionRunRelayMessage {
	return (
		typeof msg === "object" &&
		msg !== null &&
		(msg as SessionRunRelayMessage).type === "sessionRunRelay" &&
		typeof (msg as SessionRunRelayMessage).sessionId === "string"
	);
}

export type OffscreenRunCoordinatorMessage =
	| OffscreenRunCommandMessage
	| OffscreenRunEventMessage
	| OffscreenRunStateMessage
	| OffscreenQueryRunsMessage
	| OffscreenAdoptRunsMessage
	| OffscreenPanelRelayMessage
	| OffscreenPanelRelayResponse;

export function isOffscreenRunCommandMessage(
	msg: unknown,
): msg is OffscreenRunCommandMessage {
	return (
		typeof msg === "object" &&
		msg !== null &&
		(msg as OffscreenRunCommandMessage).type === "offscreenRunCommand" &&
		typeof (msg as OffscreenRunCommandMessage).sessionId === "string" &&
		typeof (msg as OffscreenRunCommandMessage).windowId === "number" &&
		typeof (msg as OffscreenRunCommandMessage).message === "object" &&
		(msg as OffscreenRunCommandMessage).message !== null
	);
}

export function isOffscreenRunEventMessage(
	msg: unknown,
): msg is OffscreenRunEventMessage {
	return (
		typeof msg === "object" &&
		msg !== null &&
		(msg as OffscreenRunEventMessage).type === "offscreenRunEvent" &&
		typeof (msg as OffscreenRunEventMessage).sessionId === "string" &&
		typeof (msg as OffscreenRunEventMessage).event === "object" &&
		(msg as OffscreenRunEventMessage).event !== null
	);
}

export function isOffscreenQueryRunsMessage(
	msg: unknown,
): msg is OffscreenQueryRunsMessage {
	return (
		typeof msg === "object" &&
		msg !== null &&
		(msg as OffscreenQueryRunsMessage).type === "offscreenQueryRuns"
	);
}

export function isOffscreenAdoptRunsMessage(
	msg: unknown,
): msg is OffscreenAdoptRunsMessage {
	return (
		typeof msg === "object" &&
		msg !== null &&
		(msg as OffscreenAdoptRunsMessage).type === "offscreenAdoptRuns" &&
		typeof (msg as OffscreenAdoptRunsMessage).windowId === "number" &&
		Array.isArray((msg as OffscreenAdoptRunsMessage).sessionIds)
	);
}

export function isOffscreenPanelRelayMessage(
	msg: unknown,
): msg is OffscreenPanelRelayMessage {
	return (
		typeof msg === "object" &&
		msg !== null &&
		(msg as OffscreenPanelRelayMessage).type === "offscreenPanelRelay" &&
		typeof (msg as OffscreenPanelRelayMessage).windowId === "number" &&
		typeof (msg as OffscreenPanelRelayMessage).requestId === "string"
	);
}

export function isOffscreenPanelRelayResponse(
	msg: unknown,
): msg is OffscreenPanelRelayResponse {
	return (
		typeof msg === "object" &&
		msg !== null &&
		(msg as OffscreenPanelRelayResponse).type ===
			"offscreenPanelRelayResponse" &&
		typeof (msg as OffscreenPanelRelayResponse).requestId === "string"
	);
}