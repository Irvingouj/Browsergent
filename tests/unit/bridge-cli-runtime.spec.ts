import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { BridgeCli } from "../../host/bridge-cli";
import type { BridgeRequest, BridgeResponse } from "../../src/protocol/bridge";

type SentRequest = BridgeRequest & { token: string; sessionId?: string };

describe("BridgeCli docs/reset/stop", () => {
	test("docs/reset/stop send the enrolled token and return the host result", async () => {
		const sent: SentRequest[] = [];
		const cli = new BridgeCli({
			configDir: await mkdtemp(join(tmpdir(), "browsergent-bridge-")),
			send: async (request: SentRequest): Promise<BridgeResponse> => {
				sent.push(request);
				if (request.method === "get_doc") {
					return {
						id: request.id,
						ok: true,
						method: "get_doc",
						result: "### page.click",
					};
				}
				if (request.method === "reset") {
					return { id: request.id, ok: true, method: "reset", result: "reset" };
				}
				if (request.method === "stop") {
					return { id: request.id, ok: true, method: "stop", result: "stopped" };
				}
				return {
					id: request.id,
					ok: false,
					error: { code: "E_PROTOCOL", message: request.method },
				};
			},
		});
		await cli.enroll("tok-123");
		expect(await cli.docs("page")).toBe("### page.click");
		expect(await cli.reset()).toBe("reset");
		expect(await cli.stop()).toBe("stopped");
		expect(sent.map((request) => request.method)).toEqual([
			"get_doc",
			"reset",
			"stop",
		]);
		expect(sent.every((request) => request.token === "tok-123")).toBe(true);
		const docs = sent[0];
		if (docs?.method !== "get_doc") throw new Error("expected get_doc");
		expect(docs.params.namespace).toBe("page");
	});

	test("docs after first run reuses the CLI session so get_doc can be traced", async () => {
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
				if (request.method === "run_js") {
					return {
						id: request.id,
						ok: true,
						method: "run_js",
						result: "ok",
					};
				}
				if (request.method === "get_doc") {
					return {
						id: request.id,
						ok: true,
						method: "get_doc",
						result: "### page.click",
					};
				}
				return {
					id: request.id,
					ok: false,
					error: { code: "E_PROTOCOL", message: request.method },
				};
			},
		});
		await cli.enroll("tok-123");
		await cli.run("1 + 1");
		await cli.docs("page");
		const docs = sent.find((request) => request.method === "get_doc");
		expect(docs?.sessionId).toBe("cli-session-1");
	});
});
