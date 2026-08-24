import type { BridgeRequest, BridgeResponse } from "../protocol/bridge";
import { scheduleFileTreeRefresh } from "../sidepanel/components/files/refresh-file-tree";
import { browsergentStore } from "../state/store";
import type { StorageBackend } from "../storage/storage-backend";
import type { AgentTraceEntry } from "../types/messages";
import { createAgentTools } from "../worker/agent-tools";
import { BridgeGate } from "./bridge-gate";
import { BridgeHost } from "./bridge-host";
import { BridgeSessionHost } from "./bridge-session-host";
import { EnrollmentController } from "./enrollment-controller";
import type { SessionController } from "./session-controller";

type SharedTools = ReturnType<typeof createAgentTools>;

export interface BridgeRuntime {
	reset: () => Promise<void>;
	stop: () => Promise<void>;
}

type EnrollmentHostDeps = {
	sessions: SessionController;
	tools: SharedTools;
	runtime?: BridgeRuntime;
	onCliEnrolled?: (enrolled: boolean) => void;
} & (
	| { enrollment: EnrollmentController }
	| { storage: StorageBackend }
);

export class EnrollmentHost {
	private readonly enrollment: EnrollmentController;
	private readonly sessions: SessionController;
	private readonly gate: BridgeGate;
	private readonly onCliEnrolled: ((enrolled: boolean) => void) | undefined;
	private paired = false;

	constructor(deps: EnrollmentHostDeps) {
		this.enrollment =
			"enrollment" in deps
				? deps.enrollment
				: new EnrollmentController(deps.storage);
		this.sessions = deps.sessions;
		this.onCliEnrolled = deps.onCliEnrolled;
		this.gate = new BridgeGate({
			enrollment: this.enrollment,
			sessions: new BridgeSessionHost(deps.sessions),
			tools: new BridgeHost({ tools: deps.tools }),
			runtime: deps.runtime,
		});
	}

	private setCliEnrolled(enrolled: boolean): void {
		if (this.paired === enrolled) {
			void this.enrollment.setCliEnrolled(enrolled);
			return;
		}
		this.paired = enrolled;
		this.onCliEnrolled?.(enrolled);
		void this.enrollment.setCliEnrolled(enrolled);
	}

	async restoreCliEnrollment(): Promise<void> {
		const enrolled = await this.enrollment.wasCliEnrolled();
		if (!enrolled) return;
		this.paired = true;
		this.onCliEnrolled?.(true);
	}

	async token(): Promise<string | null> {
		return this.enrollment.current();
	}

	async generate(): Promise<string> {
		return this.enrollment.generate();
	}

	async revoke(): Promise<void> {
		await this.enrollment.revoke();
		this.setCliEnrolled(false);
	}

	cliEnrolled(): boolean {
		return this.paired;
	}

	async handle(
		request: BridgeRequest & { token: string; sessionId?: string },
	): Promise<BridgeResponse> {
		const response = await this.gate.handle(request);
		if (response.ok) {
			const paired = await this.enrollment.matches(request.token);
			this.setCliEnrolled(paired);
		}
		if (
			response.ok &&
			isTracedMethod(request.method) &&
			typeof response.result === "string"
		) {
			const input =
				request.method === "run_js"
					? request.params.code
					: JSON.stringify(
							"params" in request ? request.params : {},
					  );
			await this.persistTrace(
				request.sessionId,
				request.method,
				input,
				response.result,
			);
			if (
				request.sessionId &&
				browsergentStore.getState().session.activeSessionId ===
					request.sessionId
			) {
				const loaded = await this.sessions.loadForSession(request.sessionId);
				browsergentStore.getState().hydrateTrace(loaded?.trace ?? []);
			}
		}
		if (
			response.ok &&
			(request.method === "file_write" ||
				request.method === "file_edit" ||
				request.method === "file_delete")
		) {
			scheduleFileTreeRefresh();
		}
		return response;
	}

	private async persistTrace(
		sessionId: string | undefined,
		toolName: string,
		input: string,
		result: string,
	): Promise<void> {
		if (!sessionId) return;
		const loaded = await this.sessions.loadForSession(sessionId);
		if (!loaded) return;
		const entry: AgentTraceEntry = {
			id: crypto.randomUUID(),
			step: loaded.trace.length + 1,
			status: "done",
			toolName,
			toolInput: input,
			result,
			timestamp: Date.now(),
		};
		await this.sessions.saveForSession(
			sessionId,
			loaded.messages,
			[...loaded.trace, entry],
			loaded.diagnostics,
		);
	}
}

function isTracedMethod(
	method: BridgeRequest["method"],
): method is
	| "run_js"
	| "file_write"
	| "file_edit"
	| "file_delete"
	| "file_read"
	| "file_list"
	| "get_doc"
	| "load_skill" {
	switch (method) {
		case "run_js":
		case "file_write":
		case "file_edit":
		case "file_delete":
		case "file_read":
		case "file_list":
		case "get_doc":
		case "load_skill":
			return true;
		case "session.create":
		case "session.list":
		case "status":
		case "reset":
		case "stop":
			return false;
	}
}
