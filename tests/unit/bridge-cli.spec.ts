import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { BridgeCli } from "../../host/bridge-cli";
import type { BridgeRequest, BridgeResponse } from "../../src/protocol/bridge";

type SentRequest = BridgeRequest & { token: string; sessionId?: string };

describe("BridgeCli enroll", () => {
	test("enroll stores the token so a later run sends it without asking again", async () => {
		const configDir = await mkdtemp(join(tmpdir(), "browsergent-bridge-"));
		const sent: SentRequest[] = [];
		const cli = new BridgeCli({
			configDir,
			send: async (request: SentRequest): Promise<BridgeResponse> => {
				sent.push(request);
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
				return {
					id: request.id,
					ok: true,
					method: "run_js",
					result: "ok",
				};
			},
		});

		await cli.enroll("tok-123");
		const stored = JSON.parse(
			await readFile(join(configDir, "bridge.json"), "utf8"),
		) as { token: string };
		expect(stored.token).toBe("tok-123");

		const result = await cli.run("await page.snapshot()");
		expect(result).toBe("ok");
		expect(sent.every((request) => request.token === "tok-123")).toBe(true);
		const run = sent.find((request) => request.method === "run_js");
		expect(run?.method).toBe("run_js");
		if (run?.method !== "run_js") {
			throw new Error("expected run_js");
		}
		expect(run.params.code).toBe("await page.snapshot()");
	});

	test("runFile sends the file body as run_js code so the agent does not quote a novel on argv", async () => {
		const configDir = await mkdtemp(join(tmpdir(), "browsergent-bridge-"));
		const sent: SentRequest[] = [];
		const cli = new BridgeCli({
			configDir,
			send: async (request: SentRequest): Promise<BridgeResponse> => {
				sent.push(request);
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
				return {
					id: request.id,
					ok: true,
					method: "run_js",
					result: "from-file",
				};
			},
		});
		await cli.enroll("tok-123");
		const script = join(configDir, "cell.js");
		await writeFile(
			script,
			"const s = await page.snapshot();\nconsole.log(s);\ns;\n",
		);
		expect(await cli.runFile(script)).toBe("from-file");
		const run = sent.find((request) => request.method === "run_js");
		if (run?.method !== "run_js") throw new Error("expected run_js");
		expect(run.params.code).toContain("await page.snapshot()");
	});

	test("writeFile sends the path and content on the CLI session", async () => {
		const sent: SentRequest[] = [];
		const cli = new BridgeCli({
			configDir: await mkdtemp(join(tmpdir(), "browsergent-bridge-")),
			send: async (request: SentRequest): Promise<BridgeResponse> => {
				sent.push(request);
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
				return {
					id: request.id,
					ok: true,
					method: "file_write",
					result: "Wrote /bridge-note.md: 8 bytes.",
				};
			},
		});
		await cli.enroll("tok-123");
		expect(await cli.writeFile("/bridge-note.md", "from cli")).toContain(
			"8 bytes",
		);
		const write = sent.find((request) => request.method === "file_write");
		if (write?.method !== "file_write") {
			throw new Error("expected file_write");
		}
		expect(write.sessionId).toBe("cli-session-1");
		expect(write.params).toEqual({
			path: "/bridge-note.md",
			content: "from cli",
		});
	});

	test("unreachable host is reported as disconnected, not a raw fetch crash", async () => {
		const { postBridgeRequest } = await import("../../host/bridge-http");
		await expect(
			postBridgeRequest("http://127.0.0.1:1/bridge", {
				id: "cli-status-1",
				token: "tok-123",
				method: "status",
			}),
		).rejects.toThrow(/host is not running|E_EXTENSION_DISCONNECTED|disconnected/i);
	});
});
