import type { AgentToolDefinition } from "@pi-oxide/pi-host-web";
import { z } from "zod";
import {
	type BashCommandResult,
	BashErrorCode,
	BashRelayError,
} from "../../bash/types";
import { formatToolError } from "../tool-error-result";

export const BASH_DESCRIPTION = `Run a command in a simulated bash over the shared OPFS filesystem (the same files as the Files panel and file_* tools).

This is not the user's computer. There is no network and no host process. The current directory starts at / and persists across bash calls in this session. Relative paths resolve against that directory.

Supports pipes, redirects, globs, and the usual file commands (ls, cat, grep, sed, awk, find, mkdir, rm, mv, cp, jq). Use file_edit when you need an exact text replacement. Symlinks are not available.`;

export function formatBashResult(result: BashCommandResult): string {
	let text = result.stdout;
	if (result.stderr) {
		if (text.length > 0 && !text.endsWith("\n")) text += "\n";
		text += result.stderr;
	}
	if (result.exitCode !== 0) {
		if (text.length > 0 && !text.endsWith("\n")) text += "\n";
		text += `exit code: ${result.exitCode}\n`;
	}
	return text;
}

export function createBashTool(
	bash: (command: string) => Promise<BashCommandResult>,
): AgentToolDefinition {
	return {
		name: "bash",
		description: BASH_DESCRIPTION,
		inputSchema: {
			type: "object",
			properties: {
				command: {
					type: "string",
					description:
						"Bash script to run. The session's current directory persists across calls.",
				},
			},
			required: ["command"],
		},
		run: async (
			// Model tool arguments arrive as untrusted JSON.
			input: unknown,
		) => {
			const parsed = z.object({ command: z.string() }).safeParse(input);
			if (!parsed.success || parsed.data.command.trim().length === 0) {
				return formatToolError(
					"E_BASH_INVALID",
					"bash requires a non-empty 'command' string",
					"Example: ls /",
				);
			}
			try {
				const result = await bash(parsed.data.command);
				return formatBashResult(result);
			} catch (err: unknown) {
				// The relay or shell failed before it could return a transcript.
				const message = err instanceof Error ? err.message : String(err);
				const code =
					err instanceof BashRelayError ? err.code : BashErrorCode.Failed;
				return formatToolError(
					code,
					message,
					"The simulated shell failed before it could finish.",
				);
			}
		},
	};
}
