import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import {
	parseBridgeResponse,
	type BridgeResponse,
	type BridgeWireRequest,
} from "../src/protocol/bridge.ts";

const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const OP_TEXT = 0x1;
const OP_CLOSE = 0x8;

export class ExtensionSocket {
	private socket: Duplex | null = null;
	private buffer = Buffer.alloc(0);
	onConnect: (() => void) | null = null;
	onDisconnect: (() => void) | null = null;
	private readonly pending = new Map<
		string,
		{ resolve: (response: BridgeResponse) => void }
	>();

	get connected(): boolean {
		return this.socket !== null;
	}

	accept(req: IncomingMessage, socket: Duplex): boolean {
		if (req.url !== "/extension") return false;
		const key = req.headers["sec-websocket-key"];
		if (typeof key !== "string" || key.length === 0) return false;
		const accept = createHash("sha1")
			.update(key + WS_MAGIC)
			.digest("base64");
		socket.write(
			[
				"HTTP/1.1 101 Switching Protocols",
				"Upgrade: websocket",
				"Connection: Upgrade",
				`Sec-WebSocket-Accept: ${accept}`,
				"",
				"",
			].join("\r\n"),
		);
		this.replaceSocket(socket);
		return true;
	}

	send(request: BridgeWireRequest): Promise<BridgeResponse> {
		const socket = this.socket;
		if (!socket) {
			return Promise.resolve({
				id: request.id,
				ok: false,
				error: {
					code: "E_EXTENSION_DISCONNECTED",
					message: "Browsergent extension is not connected",
				},
			});
		}
		return new Promise<BridgeResponse>((resolve) => {
			this.pending.set(request.id, { resolve });
			socket.write(encodeTextFrame(JSON.stringify(request)));
		});
	}

	close(): void {
		this.replaceSocket(null);
	}

	private replaceSocket(next: Duplex | null): void {
		const wasConnected = this.socket !== null;
		if (this.socket) {
			this.socket.removeAllListeners("data");
			this.socket.removeAllListeners("end");
			this.socket.removeAllListeners("close");
			this.socket.removeAllListeners("error");
			this.socket.destroy();
		}
		this.socket = next;
		this.buffer = Buffer.alloc(0);
		for (const [id, pending] of this.pending) {
			pending.resolve({
				id,
				ok: false,
				error: {
					code: "E_EXTENSION_DISCONNECTED",
					message: "Browsergent extension is not connected",
				},
			});
		}
		this.pending.clear();
		if (next) {
			this.onConnect?.();
			next.on("data", (chunk: Buffer) => {
				this.buffer = Buffer.concat([this.buffer, chunk]);
				this.drain();
			});
			next.on("end", () => this.replaceSocket(null));
			next.on("close", () => this.replaceSocket(null));
			next.on("error", () => this.replaceSocket(null));
			return;
		}
		if (wasConnected) this.onDisconnect?.();
	}

	private drain(): void {
		while (true) {
			const frame = decodeFrame(this.buffer);
			if (!frame) return;
			this.buffer = frame.rest;
			if (frame.opcode === OP_CLOSE) {
				this.replaceSocket(null);
				return;
			}
			if (frame.opcode !== OP_TEXT) continue;
			let raw: unknown;
			try {
				// Untrusted websocket payload from the sidepanel.
				raw = JSON.parse(frame.payload.toString("utf8"));
			} catch {
				continue;
			}
			const fallbackId =
				typeof raw === "object" &&
				raw !== null &&
				"id" in raw &&
				typeof raw.id === "string"
					? raw.id
					: "";
			const response = parseBridgeResponse(raw, fallbackId);
			const pending = this.pending.get(response.id);
			if (!pending) continue;
			this.pending.delete(response.id);
			pending.resolve(response);
		}
	}
}

export function isWebSocketUpgrade(req: IncomingMessage): boolean {
	return (
		req.method === "GET" &&
		req.url === "/extension" &&
		req.headers.upgrade?.toLowerCase() === "websocket"
	);
}

export function rejectUpgrade(res: ServerResponse): void {
	res.writeHead(400, { "content-type": "application/json" });
	res.end(
		JSON.stringify({
			id: "",
			ok: false,
			error: { code: "E_PROTOCOL", message: "Invalid websocket upgrade" },
		}),
	);
}

function encodeTextFrame(text: string): Buffer {
	const payload = Buffer.from(text, "utf8");
	const length = payload.length;
	let header: Buffer;
	if (length < 126) {
		header = Buffer.alloc(2);
		header[0] = 0x80 | OP_TEXT;
		header[1] = length;
	} else if (length < 65536) {
		header = Buffer.alloc(4);
		header[0] = 0x80 | OP_TEXT;
		header[1] = 126;
		header.writeUInt16BE(length, 2);
	} else {
		header = Buffer.alloc(10);
		header[0] = 0x80 | OP_TEXT;
		header[1] = 127;
		header.writeUInt32BE(0, 2);
		header.writeUInt32BE(length, 6);
	}
	return Buffer.concat([header, payload]);
}

function decodeFrame(
	buffer: Buffer,
): { opcode: number; payload: Buffer; rest: Buffer } | null {
	if (buffer.length < 2) return null;
	const opcode = buffer[0] & 0x0f;
	const masked = (buffer[1] & 0x80) !== 0;
	let length = buffer[1] & 0x7f;
	let offset = 2;
	if (length === 126) {
		if (buffer.length < 4) return null;
		length = buffer.readUInt16BE(2);
		offset = 4;
	} else if (length === 127) {
		if (buffer.length < 10) return null;
		length = buffer.readUInt32BE(6);
		offset = 10;
	}
	const maskLength = masked ? 4 : 0;
	if (buffer.length < offset + maskLength + length) return null;
	let payload = buffer.subarray(offset + maskLength, offset + maskLength + length);
	if (masked) {
		const mask = buffer.subarray(offset, offset + 4);
		payload = Buffer.from(payload);
		for (let i = 0; i < payload.length; i++) {
			payload[i] ^= mask[i % 4];
		}
	}
	return {
		opcode,
		payload,
		rest: buffer.subarray(offset + maskLength + length),
	};
}


