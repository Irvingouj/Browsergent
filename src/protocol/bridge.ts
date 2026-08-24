import { z } from "zod";

/**
 * Wire protocol between the local CLI daemon and the Browsergent side panel.
 * Incoming frames are untrusted JSON — parse at this boundary, then pass
 * named types inward.
 */

const sessionLifecycleSchema = z.enum(["foreground", "background"]);

export const bridgeSessionSummarySchema = z.object({
	id: z.string().min(1),
	title: z.string(),
	timestamp: z.number(),
	messageCount: z.number(),
	windowId: z.number().nullable(),
	lifecycle: sessionLifecycleSchema,
	origin: z.enum(["chat", "cli"]),
});

export type BridgeSessionSummary = z.infer<typeof bridgeSessionSummarySchema>;

export const bridgeRequestSchema = z.discriminatedUnion("method", [
	z.object({
		id: z.string().min(1),
		method: z.literal("session.create"),
	}),
	z.object({
		id: z.string().min(1),
		method: z.literal("session.list"),
	}),
	z.object({
		id: z.string().min(1),
		method: z.literal("file_write"),
		params: z.object({
			path: z.string(),
			content: z.string(),
		}),
	}),
	z.object({
		id: z.string().min(1),
		method: z.literal("file_read"),
		params: z.object({
			path: z.string(),
		}),
	}),
	z.object({
		id: z.string().min(1),
		method: z.literal("run_js"),
		params: z.object({
			code: z.string(),
		}),
	}),
	z.object({
		id: z.string().min(1),
		method: z.literal("get_doc"),
		params: z
			.object({
				format: z.string().optional(),
				namespace: z.string().optional(),
			})
			.default({}),
	}),
	z.object({
		id: z.string().min(1),
		method: z.literal("load_skill"),
		params: z.object({
			skill: z.string(),
			path: z.string().optional(),
		}),
	}),
	z.object({
		id: z.string().min(1),
		method: z.literal("file_list"),
		params: z
			.object({
				prefix: z.string().optional(),
			})
			.default({}),
	}),
	z.object({
		id: z.string().min(1),
		method: z.literal("file_edit"),
		params: z.object({
			path: z.string(),
			old_string: z.string(),
			new_string: z.string(),
			replace_all: z.boolean().optional(),
		}),
	}),
	z.object({
		id: z.string().min(1),
		method: z.literal("file_delete"),
		params: z.object({
			path: z.string(),
		}),
	}),
	z.object({
		id: z.string().min(1),
		method: z.literal("status"),
	}),
	z.object({
		id: z.string().min(1),
		method: z.literal("reset"),
	}),
	z.object({
		id: z.string().min(1),
		method: z.literal("stop"),
	}),
]);

export type BridgeRequest = z.infer<typeof bridgeRequestSchema>;

export const bridgeWireRequestSchema = bridgeRequestSchema.and(
	z.object({
		token: z.string().min(1),
		sessionId: z.string().min(1).optional(),
	}),
);

export type BridgeWireRequest = z.infer<typeof bridgeWireRequestSchema>;

export type SessionBridgeRequest = Extract<
	BridgeRequest,
	{ method: "session.create" | "session.list" }
>;

export type BridgeErrorCode =
	| "E_PROTOCOL"
	| "E_SESSION_STORE"
	| "E_NOT_PAIRED"
	| "E_EXTENSION_DISCONNECTED";

export interface BridgeError {
	code: BridgeErrorCode;
	message: string;
}

export type BridgeSuccess =
	| {
			id: string;
			ok: true;
			method: "session.create";
			result: BridgeSessionSummary;
	  }
	| {
			id: string;
			ok: true;
			method: "session.list";
			result: { sessions: BridgeSessionSummary[] };
	  }
	| {
			id: string;
			ok: true;
			method: "file_write";
			result: string;
	  }
	| {
			id: string;
			ok: true;
			method: "file_read";
			result: string;
	  }
	| {
			id: string;
			ok: true;
			method: "run_js";
			result: string;
	  }
	| {
			id: string;
			ok: true;
			method: "get_doc";
			result: string;
	  }
	| {
			id: string;
			ok: true;
			method: "load_skill";
			result: string;
	  }
	| {
			id: string;
			ok: true;
			method: "file_list";
			result: string;
	  }
	| {
			id: string;
			ok: true;
			method: "file_edit";
			result: string;
	  }
	| {
			id: string;
			ok: true;
			method: "file_delete";
			result: string;
	  }
	| {
			id: string;
			ok: true;
			method: "status";
			result: { connected: boolean; enrolled: boolean };
	  }
	| {
			id: string;
			ok: true;
			method: "reset";
			result: string;
	  }
	| {
			id: string;
			ok: true;
			method: "stop";
			result: string;
	  };

export type BridgeFailure = {
	id: string;
	ok: false;
	error: BridgeError;
};

export type BridgeResponse = BridgeSuccess | BridgeFailure;

const bridgeErrorSchema = z.object({
	code: z.enum([
		"E_PROTOCOL",
		"E_SESSION_STORE",
		"E_NOT_PAIRED",
		"E_EXTENSION_DISCONNECTED",
	]),
	message: z.string(),
});

const bridgeFailureSchema = z.object({
	id: z.string(),
	ok: z.literal(false),
	error: bridgeErrorSchema,
});

const bridgeSuccessSchema = z.discriminatedUnion("method", [
	z.object({
		id: z.string().min(1),
		ok: z.literal(true),
		method: z.literal("session.create"),
		result: bridgeSessionSummarySchema,
	}),
	z.object({
		id: z.string().min(1),
		ok: z.literal(true),
		method: z.literal("session.list"),
		result: z.object({ sessions: z.array(bridgeSessionSummarySchema) }),
	}),
	z.object({
		id: z.string().min(1),
		ok: z.literal(true),
		method: z.literal("file_write"),
		result: z.string(),
	}),
	z.object({
		id: z.string().min(1),
		ok: z.literal(true),
		method: z.literal("file_read"),
		result: z.string(),
	}),
	z.object({
		id: z.string().min(1),
		ok: z.literal(true),
		method: z.literal("run_js"),
		result: z.string(),
	}),
	z.object({
		id: z.string().min(1),
		ok: z.literal(true),
		method: z.literal("get_doc"),
		result: z.string(),
	}),
	z.object({
		id: z.string().min(1),
		ok: z.literal(true),
		method: z.literal("load_skill"),
		result: z.string(),
	}),
	z.object({
		id: z.string().min(1),
		ok: z.literal(true),
		method: z.literal("file_list"),
		result: z.string(),
	}),
	z.object({
		id: z.string().min(1),
		ok: z.literal(true),
		method: z.literal("file_edit"),
		result: z.string(),
	}),
	z.object({
		id: z.string().min(1),
		ok: z.literal(true),
		method: z.literal("file_delete"),
		result: z.string(),
	}),
	z.object({
		id: z.string().min(1),
		ok: z.literal(true),
		method: z.literal("status"),
		result: z.object({
			connected: z.boolean(),
			enrolled: z.boolean(),
		}),
	}),
	z.object({
		id: z.string().min(1),
		ok: z.literal(true),
		method: z.literal("reset"),
		result: z.string(),
	}),
	z.object({
		id: z.string().min(1),
		ok: z.literal(true),
		method: z.literal("stop"),
		result: z.string(),
	}),
]);

export const bridgeResponseSchema = z.union([
	bridgeSuccessSchema,
	bridgeFailureSchema,
]);

export function isBridgeFailure(
	value: BridgeWireRequest | BridgeFailure,
): value is BridgeFailure {
	return "ok" in value && value.ok === false;
}

export function parseBridgeRequest(
	// Untrusted JSON from the local CLI / websocket.
	raw: unknown,
): BridgeWireRequest | BridgeFailure {
	const parsed = bridgeWireRequestSchema.safeParse(raw);
	if (parsed.success) return parsed.data;
	return {
		id: requestIdFromUnknown(raw),
		ok: false,
		error: {
			code: "E_PROTOCOL",
			message: "Invalid bridge request",
		},
	};
}

export function parseBridgeResponse(
	// Untrusted JSON from the daemon or extension websocket.
	raw: unknown,
	requestId: string,
): BridgeResponse {
	const parsed = bridgeResponseSchema.safeParse(raw);
	if (parsed.success) return parsed.data;
	return {
		id: requestId,
		ok: false,
		error: {
			code: "E_PROTOCOL",
			message: "Invalid bridge response",
		},
	};
}

function requestIdFromUnknown(
	// Untrusted JSON that failed request schema parse.
	raw: unknown,
): string {
	if (typeof raw !== "object" || raw === null) return "";
	if (!("id" in raw)) return "";
	const id = raw.id;
	return typeof id === "string" ? id : "";
}
