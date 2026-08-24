import { describe, expect, test, vi } from "vitest";
import { BridgeHost } from "../../src/controllers/bridge-host";
import { createAgentTools } from "../../src/worker/agent-tools";
import { formatJsRunResult } from "../../src/types/extjs-utils";
import type { CellResult } from "../../src/types/extjs-utils";

describe("BridgeHost run_js", () => {
	test("CLI run_js returns the same result Chat's run_js tool returns", async () => {
		const cell: CellResult = {
			status: "ok",
			stdout: ["snap"],
			stderr: [],
			result: '{"url":"https://example.com"}',
			execution_count: 1,
		};
		const runJs = vi.fn().mockResolvedValue(cell);
		const tools = createAgentTools(runJs, vi.fn(), vi.fn(), vi.fn());
		const host = new BridgeHost({ tools });
		const code = "await page.snapshot()";

		const chatHandler = tools.getHandler("run_js");
		if (!chatHandler) throw new Error("run_js handler not found");
		const chatResult = await chatHandler({ code });

		const cli = await host.handle({
			id: "req-run",
			method: "run_js",
			params: { code },
		});

		expect(cli.ok).toBe(true);
		if (!cli.ok || cli.method !== "run_js") {
			throw new Error("expected run_js success");
		}
		expect(cli.result).toBe(chatResult);
		expect(cli.result).toBe(formatJsRunResult(cell));
		expect(runJs).toHaveBeenCalledWith(code);
	});
});
