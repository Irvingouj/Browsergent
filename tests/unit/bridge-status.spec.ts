import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { BridgeCli } from "../../host/bridge-cli";
import { BridgeDaemon } from "../../host/bridge-daemon";

describe("BridgeCli status", () => {
	test("status before enroll reports disconnected instead of crashing", async () => {
		const daemon = new BridgeDaemon();
		const cli = new BridgeCli({
			configDir: await mkdtemp(join(tmpdir(), "browsergent-bridge-")),
			send: (request) => daemon.handleCli(request),
		});
		expect(await cli.status()).toEqual({
			connected: false,
			enrolled: false,
		});
	});

	test("status reports disconnected when the sidepanel is not attached", async () => {
		const daemon = new BridgeDaemon();
		const cli = new BridgeCli({
			configDir: await mkdtemp(join(tmpdir(), "browsergent-bridge-")),
			send: (request) => daemon.handleCli(request),
		});
		await cli.enroll("tok-123");
		expect(await cli.status()).toEqual({
			connected: false,
			enrolled: false,
		});
	});

	test("status reports connected after an extension handler attaches", async () => {
		const daemon = new BridgeDaemon();
		daemon.attach(async (request) => ({
			id: request.id,
			ok: true,
			method: "status",
			result: { connected: true, enrolled: true },
		}));
		const cli = new BridgeCli({
			configDir: await mkdtemp(join(tmpdir(), "browsergent-bridge-")),
			send: (request) => daemon.handleCli(request),
		});
		await cli.enroll("tok-123");
		expect(await cli.status()).toEqual({
			connected: true,
			enrolled: true,
		});
	});
});
