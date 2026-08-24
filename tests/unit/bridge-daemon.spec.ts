import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { BridgeCli } from "../../host/bridge-cli";
import { BridgeDaemon } from "../../host/bridge-daemon";

describe("BridgeDaemon", () => {
	test("CLI run fails immediately when the sidepanel is not attached", async () => {
		const daemon = new BridgeDaemon();
		const cli = new BridgeCli({
			configDir: await mkdtemp(join(tmpdir(), "browsergent-bridge-")),
			send: (request) => daemon.handleCli(request),
		});
		await cli.enroll("tok-123");
		await expect(cli.run("await page.snapshot()")).rejects.toThrow(
			/extension is not connected/i,
		);
	});

	test("CLI run is forwarded after an extension handler attaches", async () => {
		const daemon = new BridgeDaemon();
		daemon.attach(async (request) => {
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
		});
		const cli = new BridgeCli({
			configDir: await mkdtemp(join(tmpdir(), "browsergent-bridge-")),
			send: (request) => daemon.handleCli(request),
		});
		await cli.enroll("tok-123");
		expect(await cli.run("await page.snapshot()")).toBe(
			"echo:await page.snapshot()",
		);
	});
});
