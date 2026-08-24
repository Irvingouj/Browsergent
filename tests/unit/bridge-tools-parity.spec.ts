import { describe, expect, test, vi } from "vitest";
import { BridgeHost } from "../../src/controllers/bridge-host";
import type { BridgeRequest } from "../../src/protocol/bridge";
import { createAgentTools } from "../../src/worker/agent-tools";
import type { FileOp, FileOpResult } from "../../src/worker/file-op-relay";

const CHAT_TOOL_PARAMS = {
	run_js: { code: "1+1" },
	get_doc: { namespace: "page" },
	load_skill: { skill: "capability-check" },
	file_list: {},
	file_read: { path: "/notes.md" },
	file_write: { path: "/notes.md", content: "hello" },
	file_edit: {
		path: "/notes.md",
		old_string: "hello",
		new_string: "hello world",
	},
	file_delete: { path: "/notes.md" },
} as const;

async function fakeFileOp(op: FileOp): Promise<FileOpResult> {
	switch (op.op) {
		case "list":
			return { op: "list", files: [] };
		case "read":
			return { op: "read", content: "hello", bytes: 5, truncated: false };
		case "write":
			return { op: "write", bytes: op.content.length };
		case "edit":
			return { op: "edit", occurrences: 1, bytes: 11 };
		case "delete":
			return { op: "delete" };
	}
}

describe("BridgeHost Chat tool parity", () => {
	test("CLI can call every Chat tool and gets the same result", async () => {
		const tools = createAgentTools(
			vi.fn().mockResolvedValue({
				status: "ok",
				stdout: [],
				stderr: [],
				result: "2",
				execution_count: 1,
			}),
			vi.fn().mockResolvedValue("[]"),
			vi.fn().mockResolvedValue("skill body"),
			fakeFileOp,
		);
		const host = new BridgeHost({ tools });
		const chatToolNames = tools.definitions.map((definition) => definition.name);

		expect(chatToolNames.sort()).toEqual(
			[...Object.keys(CHAT_TOOL_PARAMS)].sort(),
		);

		for (const name of chatToolNames) {
			const params = CHAT_TOOL_PARAMS[name as keyof typeof CHAT_TOOL_PARAMS];
			const chatHandler = tools.getHandler(name);
			if (!chatHandler) throw new Error(`Chat handler missing: ${name}`);
			const chatResult = await chatHandler(params);
			const cli = await host.handle({
				id: `req-${name}`,
				method: name,
				params,
			} as BridgeRequest);

			expect(cli.ok, name).toBe(true);
			if (!cli.ok) throw new Error(`CLI ${name} failed`);
			expect(cli.method).toBe(name);
			expect(cli.result).toBe(chatResult);
		}
	});
});
