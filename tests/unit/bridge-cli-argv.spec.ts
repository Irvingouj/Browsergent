import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, test } from "vitest";

const CLI = join(process.cwd(), "host/cli.ts");

function runBridge(
	args: string[],
	env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			["--experimental-strip-types", "--no-warnings", CLI, ...args],
			{ env, cwd: process.cwd() },
		);
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});
		child.on("error", reject);
		child.on("close", (code) => {
			resolve({ code, stdout, stderr });
		});
	});
}

describe("host/cli.ts argv", () => {
	test("status without enroll or host prints disconnected", async () => {
		const home = await mkdtemp(join(tmpdir(), "browsergent-home-"));
		const result = await runBridge(["status"], {
			...process.env,
			HOME: home,
			BROWSERGENT_BRIDGE_URL: "http://127.0.0.1:1/bridge",
		});
		expect(result.code).toBe(0);
		expect(result.stdout.trim()).toBe("disconnected");
	});

	test("missing command prints usage", async () => {
		const home = await mkdtemp(join(tmpdir(), "browsergent-home-"));
		const result = await runBridge([], {
			...process.env,
			HOME: home,
			BROWSERGENT_BRIDGE_URL: "http://127.0.0.1:1/bridge",
		});
		expect(result.code).toBe(1);
		expect(result.stderr).toMatch(/usage: browsergent enroll/);
	});

	test("help prints how an agent uses docs then run", async () => {
		const home = await mkdtemp(join(tmpdir(), "browsergent-home-"));
		const result = await runBridge(["help"], {
			...process.env,
			HOME: home,
			BROWSERGENT_BRIDGE_URL: "http://127.0.0.1:1/bridge",
		});
		expect(result.code).toBe(0);
		expect(result.stdout).toMatch(/npm run bridge -- docs page/);
		expect(result.stdout).toMatch(/npm run bridge -- run/);
		expect(result.stdout).toMatch(/get_doc/);
	});
});
