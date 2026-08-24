import { reportWarn } from "../errors/report";
import {
	isBridgeFailure,
	parseBridgeRequest,
	type BridgeResponse,
	type BridgeWireRequest,
} from "../protocol/bridge";

export const BRIDGE_WS_URL = "ws://127.0.0.1:8787/extension";

export function connectBridgeClient(options: {
	url?: string;
	handle: (request: BridgeWireRequest) => Promise<BridgeResponse>;
	onOpen?: () => void;
	onClose?: () => void;
}): () => void {
	const url = options.url ?? BRIDGE_WS_URL;
	let closed = false;
	let socket: WebSocket | null = null;
	let retry: ReturnType<typeof setTimeout> | null = null;

	const connect = (): void => {
		if (closed) return;
		const ws = new WebSocket(url);
		socket = ws;
		ws.addEventListener("open", () => {
			if (socket === ws) options.onOpen?.();
		});
		ws.addEventListener("message", (event) => {
			// Untrusted websocket JSON from the local daemon.
			let raw: unknown;
			try {
				raw = JSON.parse(String(event.data));
			} catch (err: unknown) {
				reportWarn({
					code: "E_RELAY_PARSE",
					source: "panel",
					message: "Invalid bridge websocket frame",
					cause: err,
				});
				return;
			}
			const parsed = parseBridgeRequest(raw);
			if (isBridgeFailure(parsed)) {
				ws.send(JSON.stringify(parsed));
				return;
			}
			void options
				.handle(parsed)
				.then((response) => {
					if (ws.readyState === WebSocket.OPEN) {
						ws.send(JSON.stringify(response));
					}
				})
				.catch((err: unknown) => {
					reportWarn({
						code: "E_HOST_UNKNOWN",
						source: "panel",
						message: "Bridge request handler failed",
						cause: err,
					});
					if (ws.readyState !== WebSocket.OPEN) return;
					ws.send(
						JSON.stringify({
							id: parsed.id,
							ok: false,
							error: {
								code: "E_PROTOCOL",
								message:
									err instanceof Error
										? err.message
										: "Bridge handle failed",
							},
						}),
					);
				});
		});
		ws.addEventListener("close", () => {
			if (socket === ws) {
				socket = null;
				options.onClose?.();
			}
			if (closed) return;
			retry = setTimeout(connect, 1_000);
		});
		ws.addEventListener("error", () => {
			ws.close();
		});
	};

	connect();
	return () => {
		closed = true;
		if (retry !== null) clearTimeout(retry);
		socket?.close();
		socket = null;
	};
}
