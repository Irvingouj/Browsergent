export type PanelRegisterMessage = {
	type: "panelRegister";
	windowId: number;
	sessionId: string;
};

export type PanelUnregisterMessage = {
	type: "panelUnregister";
	windowId: number;
};

export type PanelRunningUpdateMessage = {
	type: "panelRunningUpdate";
	windowId: number;
	runningSessionIds: string[];
};

export type GlobalRunningSessionsMessage = {
	type: "globalRunningSessions";
	bySession: Record<string, number>;
};

export type RequestGlobalRunningMessage = {
	type: "requestGlobalRunning";
};

export type WindowLifecycleMessage = {
	type: "windowLifecycle";
	kind: "split" | "merge" | "close";
	sourceWindowId?: number;
	newWindowId?: number;
	removedWindowId?: number;
	survivorWindowId?: number;
	/** Sessions that were running on the removed window when it merged. */
	reboundRunningSessionIds?: string[];
};

export type WindowCoordinatorMessage =
	| PanelRegisterMessage
	| PanelUnregisterMessage
	| PanelRunningUpdateMessage
	| GlobalRunningSessionsMessage
	| RequestGlobalRunningMessage
	| WindowLifecycleMessage;

export function isWindowLifecycleMessage(
	msg: unknown,
): msg is WindowLifecycleMessage {
	return (
		typeof msg === "object" &&
		msg !== null &&
		(msg as WindowLifecycleMessage).type === "windowLifecycle" &&
		typeof (msg as WindowLifecycleMessage).kind === "string"
	);
}

export function isPanelRegisterMessage(
	msg: unknown,
): msg is PanelRegisterMessage {
	return (
		typeof msg === "object" &&
		msg !== null &&
		(msg as PanelRegisterMessage).type === "panelRegister" &&
		typeof (msg as PanelRegisterMessage).windowId === "number"
	);
}

export function isPanelUnregisterMessage(
	msg: unknown,
): msg is PanelUnregisterMessage {
	return (
		typeof msg === "object" &&
		msg !== null &&
		(msg as PanelUnregisterMessage).type === "panelUnregister" &&
		typeof (msg as PanelUnregisterMessage).windowId === "number"
	);
}

export function isPanelRunningUpdateMessage(
	msg: unknown,
): msg is PanelRunningUpdateMessage {
	return (
		typeof msg === "object" &&
		msg !== null &&
		(msg as PanelRunningUpdateMessage).type === "panelRunningUpdate" &&
		typeof (msg as PanelRunningUpdateMessage).windowId === "number" &&
		Array.isArray((msg as PanelRunningUpdateMessage).runningSessionIds)
	);
}

export function isGlobalRunningSessionsMessage(
	msg: unknown,
): msg is GlobalRunningSessionsMessage {
	return (
		typeof msg === "object" &&
		msg !== null &&
		(msg as GlobalRunningSessionsMessage).type === "globalRunningSessions" &&
		typeof (msg as GlobalRunningSessionsMessage).bySession === "object" &&
		(msg as GlobalRunningSessionsMessage).bySession !== null
	);
}

export function isRequestGlobalRunningMessage(
	msg: unknown,
): msg is RequestGlobalRunningMessage {
	return (
		typeof msg === "object" &&
		msg !== null &&
		(msg as RequestGlobalRunningMessage).type === "requestGlobalRunning"
	);
}