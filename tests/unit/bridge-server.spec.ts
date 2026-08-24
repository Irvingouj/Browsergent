import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { BridgeCli } from "../../host/bridge-cli";
import { BridgeServer } from "../../host/bridge-server";
import { postBridgeRequest } from "../../host/bridge-http";

describe("BridgeServer HTTP", () => {
	let server: BridgeServer | null = null;

	afterEach(async () => {
		await server?.stop();
		server = null;
	});

	test("CLI run fails immediately over HTTP when the sidepanel is not attached", async () => {
		server = new BridgeServer();
		const { port } = await server.listen(0);
		const cli = new BridgeCli({
			configDir: await mkdtemp(join(tmpdir(), "browsergent-bridge-")),
			send: (request) =>
				postBridgeRequest(`http://127.0.0.1:${port}/bridge`, request),
		});
		await cli.enroll("tok-123");
		await expect(cli.run("await page.snapshot()")).rejects.toThrow(
			/extension is not connected/i,
		);
	});

	test("invalid JSON on /bridge returns E_PROTOCOL instead of hanging", async () => {
		server = new BridgeServer();
		const { port } = await server.listen(0);
		const response = await fetch(`http://127.0.0.1:${port}/bridge`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{not-json",
		});
		const body = (await response.json()) as {
			ok: boolean;
			error?: { code: string; message: string };
		};
		expect(response.ok).toBe(false);
		expect(body.ok).toBe(false);
		expect(body.error?.code).toBe("E_PROTOCOL");
	});
});
