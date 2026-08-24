import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { BridgeCli } from "../../host/bridge-cli";
import type { BridgeRequest, BridgeResponse } from "../../src/protocol/bridge";

type SentRequest = BridgeRequest & { token: string; sessionId?: string };

describe("BridgeCli run session", () => {
	test("first run creates a session and later runs reuse it", async () => {
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
		await cli.run("await page.snapshot()");
		await cli.run("await page.title()");

		expect(sent.map((request) => request.method)).toEqual([
			"session.create",
			"run_js",
			"run_js",
		]);
		expect(sent[0]?.token).toBe("tok-123");
		expect(sent[1]?.sessionId).toBe("cli-session-1");
		expect(sent[2]?.sessionId).toBe("cli-session-1");
		if (sent[1]?.method !== "run_js" || sent[2]?.method !== "run_js") {
			throw new Error("expected run_js");
		}
		expect(sent[1].params.code).toBe("await page.snapshot()");
		expect(sent[2].params.code).toBe("await page.title()");

		const stored = JSON.parse(
			await readFile(join(configDir, "bridge.json"), "utf8"),
		) as { token: string; sessionId: string };
		expect(stored.sessionId).toBe("cli-session-1");
	});

	test("overlapping runs use distinct request ids so the host can reply to both", async () => {
		const sent: SentRequest[] = [];
		let releaseFirst: (() => void) | undefined;
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
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
				if (request.method === "run_js" && sent.filter((item) => item.method === "run_js").length === 1) {
					await firstGate;
				}
				return {
					id: request.id,
					ok: true,
					method: "run_js",
					result: `echo:${request.method === "run_js" ? request.params.code : ""}`,
				};
			},
		});
		await cli.enroll("tok-123");
		const first = cli.run("one");
		const second = cli.run("two");
		await Promise.resolve();
		releaseFirst?.();
		expect(await first).toBe("echo:one");
		expect(await second).toBe("echo:two");
		const creates = sent.filter((request) => request.method === "session.create");
		const runs = sent.filter((request) => request.method === "run_js");
		expect(creates).toHaveLength(1);
		expect(runs).toHaveLength(2);
		expect(runs[0]?.id).not.toBe(runs[1]?.id);
		expect(runs[0]?.sessionId).toBe("cli-session-1");
		expect(runs[1]?.sessionId).toBe("cli-session-1");
	});
});
