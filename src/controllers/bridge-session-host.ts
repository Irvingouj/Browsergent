import type {
	BridgeResponse,
	BridgeSessionSummary,
	SessionBridgeRequest,
} from "../protocol/bridge";
import type { SessionListItem } from "../state/slices/session-slice";
import { browsergentStore } from "../state/store";
import type { SessionController } from "./session-controller";

export class BridgeSessionHost {
	constructor(private readonly sessions: SessionController) {}

	async handle(request: SessionBridgeRequest): Promise<BridgeResponse> {
		try {
			if (request.method === "session.create") {
				const id = await this.sessions.createSession("cli");
				const listed = await this.sessions.listSessions();
				const created = listed.sessions.find((session) => session.id === id);
				if (!created) {
					return {
						id: request.id,
						ok: false,
						error: {
							code: "E_SESSION_STORE",
							message: "Created session did not appear in the session list",
						},
					};
				}
				browsergentStore.getState().sessionCreated(id, "cli");
				return {
					id: request.id,
					ok: true,
					method: "session.create",
					result: toSummary(created),
				};
			}

			const listed = await this.sessions.listSessions();
			return {
				id: request.id,
				ok: true,
				method: "session.list",
				result: { sessions: listed.sessions.map(toSummary) },
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				id: request.id,
				ok: false,
				error: { code: "E_SESSION_STORE", message },
			};
		}
	}
}

function toSummary(session: SessionListItem): BridgeSessionSummary {
	return {
		id: session.id,
		title: session.title,
		timestamp: session.timestamp,
		messageCount: session.messageCount,
		windowId: session.windowId ?? null,
		lifecycle: session.lifecycle ?? "foreground",
		origin: session.origin,
	};
}
