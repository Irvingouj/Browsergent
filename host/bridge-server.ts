import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import { isBridgeFailure, parseBridgeRequest } from "../src/protocol/bridge.ts";
import { BridgeDaemon } from "./bridge-daemon.ts";
import {
	ExtensionSocket,
	isWebSocketUpgrade,
	rejectUpgrade,
} from "./extension-socket.ts";

export class BridgeServer {
	private readonly daemon = new BridgeDaemon();
	private readonly extension = new ExtensionSocket();
	private server: Server | null = null;

	constructor() {
		this.extension.onConnect = () => {
			this.daemon.attach((request) => this.extension.send(request));
		};
		this.extension.onDisconnect = () => {
			this.daemon.detach();
		};
	}

	async listen(port: number): Promise<{ port: number }> {
		const server = createServer((req, res) => {
			void this.handle(req, res).catch((err: unknown) => {
				if (res.headersSent) return;
				res.writeHead(500, { "content-type": "application/json" });
				res.end(
					JSON.stringify({
						id: "",
						ok: false,
						error: {
							code: "E_PROTOCOL",
							message:
								err instanceof Error ? err.message : "Bridge request failed",
						},
					}),
				);
			});
		});
		server.on("upgrade", (req, socket) => {
			if (!this.extension.accept(req, socket)) {
				socket.destroy();
			}
		});
		this.server = server;
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(port, "127.0.0.1", () => resolve());
		});
		const address = server.address();
		if (typeof address !== "object" || address === null) {
			throw new Error("BridgeServer failed to bind 127.0.0.1");
		}
		return { port: address.port };
	}

	async stop(): Promise<void> {
		this.extension.close();
		this.daemon.detach();
		const server = this.server;
		if (!server) return;
		this.server = null;
		await new Promise<void>((resolve, reject) => {
			server.close((err: Error | undefined) => {
				if (err) reject(err);
				else resolve();
			});
		});
	}

	private async handle(
		req: IncomingMessage,
		res: ServerResponse,
	): Promise<void> {
		if (isWebSocketUpgrade(req)) {
			rejectUpgrade(res);
			return;
		}
		if (req.method !== "POST" || req.url !== "/bridge") {
			res.writeHead(404, { "content-type": "application/json" });
			res.end(
				JSON.stringify({
					id: "",
					ok: false,
					error: { code: "E_PROTOCOL", message: "Not found" },
				}),
			);
			return;
		}
		let raw: unknown;
		try {
			raw = await readJson(req);
		} catch (err: unknown) {
			res.writeHead(400, { "content-type": "application/json" });
			res.end(
				JSON.stringify({
					id: "",
					ok: false,
					error: {
						code: "E_PROTOCOL",
						message:
							err instanceof Error ? err.message : "Invalid JSON",
					},
				}),
			);
			return;
		}
		const parsed = parseBridgeRequest(raw);
		if (isBridgeFailure(parsed)) {
			res.writeHead(400, { "content-type": "application/json" });
			res.end(JSON.stringify(parsed));
			return;
		}
		const response = await this.daemon.handleCli(parsed);
		res.writeHead(200, { "content-type": "application/json" });
		res.end(JSON.stringify(response));
	}
}

/** Untrusted HTTP body from the local CLI. Narrowed by parseBridgeRequest. */
function readJson(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => {
			chunks.push(chunk);
		});
		req.on("end", () => {
			const body = Buffer.concat(chunks).toString("utf8");
			if (!body) {
				resolve(null);
				return;
			}
			try {
				resolve(JSON.parse(body) as unknown);
			} catch (err) {
				reject(err);
			}
		});
		req.on("error", reject);
	});
}
