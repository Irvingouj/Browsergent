import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { BridgeCli } from "../../host/bridge-cli";
import { postBridgeRequest } from "../../host/bridge-http";
import { BridgeServer } from "../../host/bridge-server";
import { connectBridgeClient } from "../../src/sidepanel/bridge-client";
import type { BridgeWireRequest } from "../../src/protocol/bridge";

describe("connectBridgeClient", () => {
	let server: BridgeServer | null = null;
	let disconnect: (() => void) | null = null;

	afterEach(() => {
		disconnect?.();
		disconnect = null;
		return server?.stop().then(() => {
			server = null;
		});
	});

	test("sidepanel client answers CLI run_js over the local websocket", async () => {
		server = new BridgeServer();
		const { port } = await server.listen(0);
		disconnect = connectBridgeClient({
			url: `ws://127.0.0.1:${port}/extension`,
			handle: async (request: BridgeWireRequest) => {
				if (request.method === "session.create") {
					return {
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
				}
				if (request.method !== "run_js") {
					return {
						id: request.id,
						ok: false,
						error: { code: "E_PROTOCOL", message: "unexpected method" },
					};
				}
				return {
					id: request.id,
					ok: true,
					method: "run_js",
					result: `echo:${request.params.code}`,
				};
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 50));
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

	test("a rejected handle still replies so the CLI does not hang", async () => {
		server = new BridgeServer();
		const { port } = await server.listen(0);
		disconnect = connectBridgeClient({
			url: `ws://127.0.0.1:${port}/extension`,
			handle: async (request: BridgeWireRequest) => {
				if (request.method === "session.create") {
					return {
						id: request.id,
						ok: true,
						method: "session.create",
						result: {
							id: "cli-session-1",
							title: "Session cli-ses",
							timestamp: 1,
							messageCount: 0,
							windowId: 1,
							lifecycle: "background",
							origin: "cli",
						},
					};
				}
				throw new Error("persist failed");
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 50));
		const cli = new BridgeCli({
			configDir: await mkdtemp(join(tmpdir(), "browsergent-bridge-")),
			send: (request) =>
				postBridgeRequest(`http://127.0.0.1:${port}/bridge`, request),
		});
		await cli.enroll("tok-123");
		await expect(cli.run("await page.snapshot()")).rejects.toThrow(/persist failed|Invalid bridge response|E_PROTOCOL/i);
	});
});
