import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { BridgeCli } from "../../host/bridge-cli";
import { EnrollmentHost } from "../../src/controllers/enrollment-host";
import { MemoryStorage } from "../../src/storage/memory-storage";
import { createAgentTools } from "../../src/worker/agent-tools";
import { initBoundController } from "./session-test-utils";

describe("EnrollmentHost", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	test("Generate mints a token the CLI can enroll, Revoke disconnects it", async () => {
		const { ctrl } = await initBoundController(storage);
		const runJs = vi.fn().mockResolvedValue({
			status: "ok",
			stdout: [],
			stderr: [],
			result: "snap",
			execution_count: 1,
		});
		const host = new EnrollmentHost({
			storage,
			sessions: ctrl,
			tools: createAgentTools(runJs, vi.fn(), vi.fn(), vi.fn()),
		});
		expect(await host.token()).toBeNull();

		const token = await host.generate();
		expect(token).toBe(await host.token());

		const cli = new BridgeCli({
			configDir: await mkdtemp(join(tmpdir(), "browsergent-bridge-")),
			send: (request) => host.handle(request),
		});
		await cli.enroll(token);
		expect(await cli.run("await page.snapshot()")).toBe("snap");
		expect(runJs).toHaveBeenCalledWith("await page.snapshot()");

		await host.revoke();
		expect(await host.token()).toBeNull();
		await expect(cli.run("await page.title()")).rejects.toThrow(
			/Enrollment token is missing or does not match/,
		);
	});

	test("CLI status with the matching token marks the CLI as enrolled", async () => {
		const { ctrl } = await initBoundController(storage);
		const enrolled: boolean[] = [];
		const host = new EnrollmentHost({
			storage,
			sessions: ctrl,
			tools: createAgentTools(vi.fn(), vi.fn(), vi.fn(), vi.fn()),
			onCliEnrolled: (value) => enrolled.push(value),
		});
		expect(host.cliEnrolled()).toBe(false);
		const token = await host.generate();
		expect(host.cliEnrolled()).toBe(false);
		const cli = new BridgeCli({
			configDir: await mkdtemp(join(tmpdir(), "browsergent-bridge-")),
			send: (request) => host.handle(request),
		});
		await cli.enroll(token);
		expect(await cli.status()).toEqual({ connected: true, enrolled: true });
		expect(host.cliEnrolled()).toBe(true);
		expect(enrolled).toContain(true);
		await host.revoke();
		expect(host.cliEnrolled()).toBe(false);
	});
});
