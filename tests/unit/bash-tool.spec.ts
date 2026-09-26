import { describe, expect, test, vi } from "vitest";
import {
	type BashCommandResult,
	BashErrorCode,
	BashRelayError,
} from "../../src/bash/types";
import { createAgentTools } from "../../src/worker/agent-tools";
import {
	createBashTool,
	formatBashResult,
} from "../../src/worker/agent-tools/bash-tool";
import { isToolErrorEnvelope } from "../../src/worker/tool-error-result";

describe("bash tool", () => {
	test("formats stdout and appends the exit code when the command fails", () => {
		expect(formatBashResult({ stdout: "hi\n", stderr: "", exitCode: 0 })).toBe(
			"hi\n",
		);
		expect(
			formatBashResult({
				stdout: "",
				stderr: "cat: nope: No such file\n",
				exitCode: 1,
			}),
		).toBe("cat: nope: No such file\nexit code: 1\n");
	});

	test("rejects an empty command before running the shell", async () => {
		const bash = vi.fn();
		const tool = createBashTool(bash);
		const result = await tool.run({ command: "   " });
		expect(typeof result).toBe("string");
		expect(isToolErrorEnvelope(result as string)).toBe(true);
		expect(bash).not.toHaveBeenCalled();
	});

	test("returns the shell transcript from the agent tool", async () => {
		const bash = vi.fn(
			async (): Promise<BashCommandResult> => ({
				stdout: "/work\n",
				stderr: "",
				exitCode: 0,
			}),
		);
		const tools = createAgentTools(vi.fn(), vi.fn(), vi.fn(), vi.fn(), bash);
		const handler = tools.getHandler("bash");
		if (!handler) throw new Error("bash handler missing");
		expect(await handler({ command: "pwd" })).toBe("/work\n");
		expect(bash).toHaveBeenCalledWith("pwd");
	});

	test("keeps the relay error code on the tool envelope", async () => {
		const bash = vi.fn(async () => {
			throw new BashRelayError(BashErrorCode.NoSession, "No active session");
		});
		const tool = createBashTool(bash);
		const result = await tool.run({ command: "pwd" });
		expect(result).toContain(BashErrorCode.NoSession);
		expect(result).toContain("No active session");
	});
});
