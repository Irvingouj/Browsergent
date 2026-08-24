import type { BridgeRequest, BridgeResponse } from "../protocol/bridge";
import type { createAgentTools } from "../worker/agent-tools";

type SharedTools = ReturnType<typeof createAgentTools>;

type ToolMethod = Extract<
	BridgeRequest,
	{
		method:
			| "run_js"
			| "get_doc"
			| "load_skill"
			| "file_list"
			| "file_read"
			| "file_write"
			| "file_edit"
			| "file_delete";
	}
>;

function isToolMethod(request: BridgeRequest): request is ToolMethod {
	switch (request.method) {
		case "run_js":
		case "get_doc":
		case "load_skill":
		case "file_list":
		case "file_read":
		case "file_write":
		case "file_edit":
		case "file_delete":
			return true;
		case "session.create":
		case "session.list":
		case "status":
		case "reset":
		case "stop":
			return false;
	}
}

export class BridgeHost {
	constructor(private readonly deps: { tools: SharedTools }) {}

	async handle(request: BridgeRequest): Promise<BridgeResponse> {
		if (!isToolMethod(request)) {
			return {
				id: request.id,
				ok: false,
				error: {
					code: "E_PROTOCOL",
					message: `Unsupported bridge method: ${request.method}`,
				},
			};
		}

		const handler = this.deps.tools.getHandler(request.method);
		if (!handler) {
			return {
				id: request.id,
				ok: false,
				error: {
					code: "E_PROTOCOL",
					message: `${request.method} is not available`,
				},
			};
		}
		const result = await handler(request.params);
		if (typeof result !== "string") {
			return {
				id: request.id,
				ok: false,
				error: {
					code: "E_PROTOCOL",
					message: `${request.method} returned a non-string result`,
				},
			};
		}
		return {
			id: request.id,
			ok: true,
			method: request.method,
			result,
		};
	}
}
