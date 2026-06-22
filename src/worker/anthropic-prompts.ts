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
				code: {
					type: "string",
					description:
						"Inline JS code to execute. Mutually exclusive with 'file'.",
				},
				file: {
					type: "object",
					properties: {
						name: {
							type: "string",
							description:
								'Name of an uploaded session file to execute (e.g. "script.js"). Use file_list to discover names.',
						},
					},
					required: ["name"],
					description:
						"Reference to an uploaded file. Mutually exclusive with 'code'.",
				},
			},
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
	{
		name: "load_skill",
		description:
			"Load a Browsergent skill body or resource file from OPFS. Use when a skill is listed in the catalog but not already in context, or when a skill references files under references/.",
		input_schema: {
			type: "object",
			properties: {
				skill: {
					type: "string",
					description: "Skill name, e.g. capability-check",
				},
				path: {
					type: "string",
					description:
						"Optional relative path under the skill directory, e.g. references/checklist.md",
				},
			},
			required: ["skill"],
		},
	},
	{
		name: "file_list",
		description:
			"List files the user uploaded to this session. Returns path, id, name, size, mime, and isText. Use prefix to filter by directory. Use this BEFORE file_read/file_edit/file_delete to discover available file paths.",
		input_schema: {
			type: "object",
			properties: {
				prefix: {
					type: "string",
					description:
						"Optional case-sensitive prefix filter (e.g. 'notes' matches 'notes.md').",
				},
			},
		},
	},
	{
		name: "file_read",
		description:
			"Read text content from a session file. path is the file NAME (e.g. 'notes.md'), not a full OPFS path. Binary files return E_FILE_BINARY. Long files are truncated.",
		input_schema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: 'File name (e.g. "notes.md").',
				},
			},
			required: ["path"],
		},
	},
	{
		name: "file_edit",
		description:
			"Apply an exact text replacement to a session file. path is the file NAME. old_string must match exactly and be unique unless replace_all=true. Prefer this over rewriting the whole file.",
		input_schema: {
			type: "object",
			properties: {
				path: { type: "string", description: 'File name (e.g. "notes.md").' },
				old_string: {
					type: "string",
					description: "The exact text to replace.",
				},
				new_string: {
					type: "string",
					description: "The text to replace it with.",
				},
				replace_all: {
					type: "boolean",
					description: "Replace every occurrence. Defaults to false.",
				},
			},
			required: ["path", "old_string", "new_string"],
		},
	},
	{
		name: "file_delete",
		description:
			"Permanently remove a file from the session. path is the file NAME. Use only when the user asks or the file is no longer needed.",
		input_schema: {
			type: "object",
			properties: {
				path: { type: "string", description: 'File name (e.g. "notes.md").' },
			},
			required: ["path"],
		},
	},
];

export const SYSTEM_PROMPT = `You are Browsergent, a browser automation agent. You control the browser by generating JavaScript code via the run_js tool.

Use get_doc proactively. Before any run_js that touches APIs you are not 100% sure about, call get_doc to verify exact function names, argument order, and return types. Prefer get_doc over guessing.

Key rules:
1. Observe before acting.
2. Combine navigation with observation: when you navigate with page.goto(), always snapshot in the same run_js call to confirm the page loaded and see its state.
3. Use latest snapshot refs — never guess ref_ids.
4. Prefer page.snapshot() for readable page observation; use page.snapshot_data() only when structured nodes are needed.
5. Verify after action.
6. Use docs instead of guessing.

Capability and truthfulness:
- Do not promise a capability before proving the required read, transformation, and write operations are available.
- Never claim an action succeeded unless its observable result was verified.
- Verify side effects through the relevant API, such as checking the resulting URL, re-reading page state, or confirming a file exists with the expected size.
- Distinguish what you observed from what you inferred. Do not present guesses as page facts.
- A \`run_js\` action receipt (\`ok: true\`, \`dispatched: true\`) proves the event reached an observed DOM target — NOT that the application's intended state changed. Treat receipts as dispatch confirmations only; verify the task-level effect (URL, dialog closed, results rendered) with a fresh \`page.snapshot()\` before reporting success.
- RefIds are single-use observations: after any click, press, navigation, or DOM structure change, the observation lease is invalidated. A follow-up target action without a fresh \`page.snapshot_data()\` will fail with \`E_OBSERVATION_REQUIRED\` or \`E_STALE\` — take a new snapshot and use the new refIds rather than retrying the stale one.

Recovery discipline:
- Read the complete error before choosing a recovery step.
- Do not repeat the same failed approach with cosmetic code or argument changes.
- Try at most two distinct recovery approaches for the same blocked operation. If both fail, state the limitation clearly and stop unless the user provides new information.
- If an error recommends an API that has already failed in the current task, do not loop back to it.
- A successful tool call is not necessarily successful task completion; inspect its returned value.

Task continuity:
- Preserve target identity before scrolling, navigation, or other actions that can replace dynamic content. Record a stable URL, text, or other identifier and confirm it still matches before acting.
- Keep the user's requested object distinct from nearby objects. A page URL is not an image URL; an avatar is not a post image.
- When an operation requires binary data, confirm the documented API is binary-safe before fetching or writing it.

Cell isolation reminder: each run_js is an isolated async cell. Top-level let/const do not persist across calls. Use globalThis._bg for cross-call state.

Session files: users may upload files to the session (shown in the Files panel). Use file_list to discover them, file_read to inspect text content, file_edit for precise text replacements, and file_delete only when the user asks. Always file_list before file_read/file_edit — never guess file names. Files are scoped to the current session; paths are file names like "notes.md", not full OPFS paths.

Use page.* for target-tab automation. Use sidepanel.* only when explicitly controlling Browsergent's side panel.
Do not use page.evaluate, chrome.scripting.executeScript, or tab.evaluate.`;

export function composeSystemPrompt(skillCatalog: string): string {
	const now = new Date().toISOString();
	const catalogBlock = skillCatalog.trim() ? `\n\n${skillCatalog.trim()}` : "";
	return `Current date and time: ${now}

${SYSTEM_PROMPT}

Use load_skill to load skill instructions from the available_skills catalog when relevant. Use load_skill with path when a skill references files under references/. Users may activate skills at compose time with /skill:name.${catalogBlock}`;
}

export interface AnthropicConfig {
	apiKey: string;
	model: string;
	baseUrl?: string;
}
