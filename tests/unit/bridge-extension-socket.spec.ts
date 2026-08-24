import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { BridgeCli } from "../../host/bridge-cli";
import { postBridgeRequest } from "../../host/bridge-http";
import { BridgeServer } from "../../host/bridge-server";
import type {
	BridgeResponse,
	BridgeWireRequest,
} from "../../src/protocol/bridge";

describe("BridgeServer extension socket", () => {
	let server: BridgeServer | null = null;
	let socket: WebSocket | null = null;

	afterEach(() => {
		socket?.close();
		socket = null;
		return server?.stop().then(() => {
			server = null;
		});
	});

	test("CLI run_js is forwarded to a connected extension websocket", async () => {
		server = new BridgeServer();
		const { port } = await server.listen(0);
		socket = new WebSocket(`ws://127.0.0.1:${port}/extension`);
		await new Promise<void>((resolve, reject) => {
			if (!socket) {
				reject(new Error("socket missing"));
				return;
			}
			socket.addEventListener("open", () => resolve(), { once: true });
			socket.addEventListener(
				"error",
				() => reject(new Error("extension websocket failed")),
				{ once: true },
			);
		});
		socket.addEventListener("message", (event) => {
			const request = JSON.parse(String(event.data)) as BridgeWireRequest;
			const response: BridgeResponse =
				request.method === "run_js"
					? {
							id: request.id,
							ok: true,
							method: "run_js",
							result: `echo:${request.params.code}`,
						}
					: {
							id: request.id,
							ok: true,
							method: "session.create",
							result: {
								id: "cli-session-1",
								title: "Session cli-ses",
								timestamp: 1,
								messageCount: 0,
								windowId: 1,
								lifecycle: "foreground",
								origin: "cli",
							},
						};
			socket?.send(JSON.stringify(response));
		});
		const cli = new BridgeCli({
			configDir: await mkdtemp(join(tmpdir(), "browsergent-bridge-")),
			send: (request) =>
				postBridgeRequest(`http://127.0.0.1:${port}/bridge`, request),
		});
		await cli.enroll("tok-123");
		expect(await cli.run("await page.snapshot()")).toBe(
			"echo:await page.snapshot()",
		);
	});
});
