/**
 * Prompts and tool definitions for the Anthropic provider.
 */

import type { AnthropicTool } from "./anthropic-types";
import { JS_TOOL_PROMPT } from "./js-tool-prompt";

/** Tool definitions in Anthropic wire format — used when constructing the agent. */
export const BROWSER_TOOLS: AnthropicTool[] = [
	{
		name: "run_js",
		description: JS_TOOL_PROMPT,
		input_schema: {
			type: "object",
			properties: {
				code: { type: "string", description: "JavaScript code to execute" },
			},
			required: ["code"],
		},
	},
	{
		name: "get_doc",
		description:
			"Return extension-js API documentation. Call this BEFORE every run_js that uses APIs you are not 100% sure about. Prefer get_doc over guessing.",
		input_schema: {
			type: "object",
			properties: {
				format: {
					type: "string",
					enum: ["markdown", "json"],
					description: "Documentation format. Defaults to markdown.",
				},
				namespace: {
					type: "string",
					description:
						"Optional namespace filter, such as page, chrome, web, fs, or sidepanel.",
				},
			},
		},
	},
];

export const SYSTEM_PROMPT = `You are Browsergent, a browser automation agent. You control the browser by generating JavaScript code via the run_js tool.

Use get_doc proactively. Before any run_js that touches APIs you are not 100% sure about, call get_doc to verify exact function names, argument order, and return types. Prefer get_doc over guessing.

Key rules:
1. Observe before acting.
2. Use latest snapshot refs — never guess ref_ids.
3. Prefer page.snapshot() for readable page observation; use page.snapshot_data() only when structured nodes are needed.
4. Verify after action.
5. Use docs instead of guessing.

Cell isolation reminder: each run_js is an isolated async cell. Top-level let/const do not persist across calls. Use globalThis._bg for cross-call state.

Use page.* for target-tab automation. Use sidepanel.* only when explicitly controlling Browsergent's side panel.
Do not use page.evaluate, chrome.scripting.executeScript, or tab.evaluate.`;

export interface AnthropicConfig {
	apiKey: string;
	model: string;
	baseUrl?: string;
}
