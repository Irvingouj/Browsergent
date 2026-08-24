import type { BridgeRequest, BridgeResponse } from "../protocol/bridge";
import type { BridgeHost } from "./bridge-host";
import type { BridgeSessionHost } from "./bridge-session-host";
import type { BridgeRuntime } from "./enrollment-host";
import type { EnrollmentController } from "./enrollment-controller";

function unpaired(id: string): BridgeResponse {
	return {
		id,
		ok: false,
		error: {
			code: "E_NOT_PAIRED",
			message: "Enrollment token is missing or does not match",
		},
	};
}

function unavailable(id: string, message: string): BridgeResponse {
	return {
		id,
		ok: false,
		error: { code: "E_PROTOCOL", message },
	};
}

export class BridgeGate {
	constructor(
		private readonly deps: {
			enrollment: EnrollmentController;
			sessions?: BridgeSessionHost;
			tools?: BridgeHost;
			runtime?: BridgeRuntime;
		},
	) {}

	async handle(
		request: BridgeRequest & { token: string },
	): Promise<BridgeResponse> {
		const paired = await this.deps.enrollment.matches(request.token);
		switch (request.method) {
			case "status":
				return {
					id: request.id,
					ok: true,
					method: "status",
					result: { connected: true, enrolled: paired },
				};
			case "session.create":
			case "session.list":
				if (!paired) return unpaired(request.id);
				if (!this.deps.sessions) {
					return unavailable(request.id, "Session host is not available");
				}
				return this.deps.sessions.handle(request);
			case "reset":
				if (!paired) return unpaired(request.id);
				if (!this.deps.runtime) {
					return unavailable(request.id, "Runtime host is not available");
				}
				await this.deps.runtime.reset();
				return {
					id: request.id,
					ok: true,
					method: "reset",
					result: "reset",
				};
			case "stop":
				if (!paired) return unpaired(request.id);
				if (!this.deps.runtime) {
					return unavailable(request.id, "Runtime host is not available");
				}
				await this.deps.runtime.stop();
				return {
					id: request.id,
					ok: true,
					method: "stop",
					result: "stopped",
				};
			case "run_js":
			case "get_doc":
			case "load_skill":
			case "file_list":
			case "file_read":
			case "file_write":
			case "file_edit":
			case "file_delete":
				if (!paired) return unpaired(request.id);
				if (!this.deps.tools) {
					return unavailable(request.id, "Tool host is not available");
				}
				return this.deps.tools.handle(request);
		}
	}
}
