import type { AgentToolDefinition } from "@pi-oxide/pi-host-web";
import { z } from "zod";
import type { CellResult } from "../../types/extjs-utils";
import { formatJsRunResult } from "../../types/extjs-utils";
import { getCurrentTraceId } from "../current-trace";
import type { FileOp, FileOpResult } from "../file-op-relay";
import { JS_TOOL_PROMPT } from "../js-tool-prompt";
import { formatToolError, isStackUseful } from "../tool-error-result";
import {
	FILE_PATH_HELP,
	formatFileOpError,
	validateFileToolPath,
} from "./file-helpers";

const RUN_JS_DESCRIPTION = JS_TOOL_PROMPT;

function classifyError(
	source: {
		kind?: string;
		message?: string;
		action?: string | null;
		code?: string | null;
		stack?: string | null;
		name?: string | null;
		hint?: string | null;
		recovery?: string[] | null;
		details?: Record<string, unknown> | null;
	},
	cellCode?: string,
): {
	code: string;
	hint: string;
	stack?: string;
	details?: Record<string, unknown>;
} {
	const stack = isStackUseful(source.stack) ? source.stack : undefined;
	const base = classifyErrorBase(source, cellCode);
	const details = source.details ?? undefined;
	return {
		...base,
		...(stack ? { stack } : {}),
		...(details ? { details } : {}),
	};
}

function classifyErrorBase(
	source: {
		kind?: string;
		message?: string;
		code?: string | null;
		name?: string | null;
		hint?: string | null;
	},
	jsSource?: string,
): { code: string; hint: string } {
	if (source.kind === "compile" || source.message?.includes("compile error"))
		return { code: "E_JS_COMPILE", hint: "Fix the syntax error and retry." };
	if (source.kind === "fuel_exhausted" || source.message?.includes("timed out"))
		return {
			code: "E_JS_TIMEOUT",
			hint: "The runtime has been rebuilt. Retry the same code.",
		};
	// Use the structured code from the CellError when available (e.g. E_CONTENT_SCRIPT,
	// E_PERMISSION, E_STALE) so the hint matches the actual failure mode.
	const errCode = source.code;
	if (errCode === "E_CONTENT_SCRIPT")
		return {
			code: errCode,
			hint: "The content script is not connected. Navigate to the tab or ask the user to refresh it.",
		};
	if (errCode === "E_PERMISSION")
		return {
			code: errCode,
			hint: "A permission error occurred. Check that the target is a normal http(s) page tab.",
		};
	if (errCode === "E_STALE")
		return {
			code: errCode,
			hint: "The element refId is stale. Take a fresh snapshot and use the new refIds.",
		};
	if (errCode === "E_NOT_FOUND") {
		if (jsSource?.includes("select_option")) {
			return {
				code: errCode,
				hint: "The option text was not found in the combobox dropdown. Check the candidates in the error and use an exact visible-text value from the dropdown options.",
			};
		}
		return {
			code: errCode,
			hint: "No matching element found. Take a fresh snapshot and verify the label or refId.",
		};
	}
	if (errCode === "E_OBSERVATION_REQUIRED")
		return {
			code: errCode,
			hint: "The action requires a fresh observation. Call `await page.snapshot_data()` and use a refId from the returned nodes.",
		};
	if (errCode === "E_AMBIGUOUS_TARGET")
		return {
			code: errCode,
			hint: "The label matched multiple observed elements. Use a refId from `page.snapshot_data()` instead of a label.",
		};
	if (errCode === "E_NO_TAB")
		return {
			code: errCode,
			hint: "No active tab resolved. Ensure the user is focused on an http(s) page, not chrome://.",
		};
	if (
		errCode === "E_JS_RUNTIME" &&
		source.message?.includes("recursive use of an object")
	) {
		return {
			code: "E_JS_RUNTIME",
			hint: "The JS runtime was re-entered mid-cell and has been rebuilt. Retry the same code in a new run_js cell; do not refresh the target tab — the acting runtime, not the content script, failed.",
		};
	}
	if (errCode === "E_TIMEOUT")
		return {
			code: errCode,
			hint: "The operation timed out. The page may be slow or the selector may not appear.",
		};
	if (errCode === "E_FETCH_BLOB_URL")
		return {
			code: errCode,
			hint: "Blob URLs are scoped to the document context that created them and may expire after Chrome downloads them. Do not fetch chrome.downloads finalUrl blob URLs; capture the bytes before download or fetch the underlying HTTP export endpoint, then write them with fs.writeBase64.",
		};
	if (errCode === "E_FETCH")
		return {
			code: errCode,
			hint: "The target page fetch failed before any response was available. Check the URL, scheme, page origin, CORS/auth requirements, and whether the URL is fetchable from the active document.",
		};
	if (source.hint)
		return {
			code: errCode ?? "E_JS_RUNTIME",
			hint: source.hint,
		};
	// QuickJS strips the message from engine-thrown TypeErrors, so an empty-message
	// runtime error is opaque. When the failing cell used page.* (which targets the
	// runner's notion of the active tab — often the side panel after web.tab.activate),
	// steer the agent toward web.tab.* with an explicit tabId, which is unambiguous.
	const isOpaqueRuntimeError =
		(source.kind === "runtime" || source.kind === undefined) &&
		(errCode === "E_JS_RUNTIME" || errCode === undefined || errCode === null) &&
		(!source.message || source.message.trim() === "");
	if (isOpaqueRuntimeError && callsSetTimeout(jsSource)) {
		return {
			code: errCode ?? "E_JS_RUNTIME",
			hint: "A TypeError occurred in a cell using setTimeout/setInterval. The sandbox has NO setTimeout — use `await web.sleep(ms)` to wait. Replace `await new Promise(r => setTimeout(r, N))` with `await web.sleep(N)`.",
		};
	}
	if (
		isOpaqueRuntimeError &&
		jsSource?.includes(".find(") &&
		jsSource.includes(".refId")
	) {
		return {
			code: errCode ?? "E_JS_RUNTIME",
			hint: "A snapshot lookup likely failed: find(...) returned undefined before its refId was used. Inspect the snapshot's actual nodes and verify the match before acting.",
		};
	}
	if (isOpaqueRuntimeError && callsPageStar(jsSource)) {
		return {
			code: errCode ?? "E_JS_RUNTIME",
			hint: "A TypeError occurred in a page.* call. page.* targets the runner's active tab, which is often the Browsergent side panel (a chrome-extension:// page) after web.tab.activate races. Use web.tab.* with an explicit tabId instead — e.g. web.tab.snapshot(tabId), web.tab.click({ tabId, refId }).",
		};
	}
	if (isOpaqueRuntimeError && callsWebTabStar(jsSource)) {
		return {
			code: errCode ?? "E_JS_RUNTIME",
			hint: "A TypeError occurred in a web.tab.* call. This usually happens when a click triggers a navigation or SPA re-render and the follow-up snapshot runs before the content script reconnects, OR the cell used setTimeout (use `await web.sleep(ms)` instead). Split click and snapshot into separate run_js cells with `await web.sleep(800)` between them, or navigate directly via page.goto with a parameterised search URL.",
		};
	}
	return {
		code: errCode ?? "E_JS_RUNTIME",
		hint: "Check the error details and try a different approach.",
	};
}

function callsWebTabStar(jsSource?: string): boolean {
	if (!jsSource) return false;
	return /\bweb\.tab\./.test(jsSource);
}
function callsPageStar(jsSource?: string): boolean {
	if (!jsSource) return false;
	return /\bpage\./.test(jsSource);
}
function callsSetTimeout(jsSource?: string): boolean {
	if (!jsSource) return false;
	return /\bsetTimeout\b|\bsetInterval\b/.test(jsSource);
}

export function createRunJsTool(
	runJs: (code: string) => Promise<CellResult>,
	fileOp: (op: FileOp) => Promise<FileOpResult>,
): AgentToolDefinition {
	return {
		name: "run_js",
		description: RUN_JS_DESCRIPTION,
		inputSchema: {
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
								'Path of a text file on the shared OPFS filesystem to execute (e.g. "script.js" or "/skills/user/my-skill/references/do-thing.js"). Use file_list to discover paths. Mutually exclusive with code.',
						},
					},
					required: ["name"],
					description:
						"Reference to a file to execute. Mutually exclusive with 'code'.",
				},
				params: {
					type: "object",
					description:
						"Optional parameters injected into the cell as globalThis._params. Use to parameterize a script executed via 'file' or to pass values into inline code without string interpolation.",
				},
			},
		},
		run: async (input: unknown) => {
			const parsed = z
				.object({
					code: z.string().optional(),
					file: z.object({ name: z.string() }).optional(),
					params: z.record(z.unknown()).optional(),
				})
				.safeParse(input);
			if (!parsed.success) {
				return "run_js input must be an object with 'code' (string) and/or 'file' ({ name: string }) and optional 'params' (object)";
			}
			const hasCode =
				parsed.data.code !== undefined && parsed.data.code.trim().length > 0;
			const hasFile =
				parsed.data.file !== undefined &&
				parsed.data.file.name.trim().length > 0;
			if (hasCode && hasFile) {
				return formatToolError(
					"E_JS_INVALID_INPUT",
					"Provide exactly one of 'code' or 'file' — they are mutually exclusive",
					"",
				);
			}
			if (!hasCode && !hasFile) {
				return "run_js requires a non-empty 'code' string or a 'file' with non-empty 'name'";
			}

			let code: string;
			if (hasFile) {
				const fileName = parsed.data.file?.name;
				if (!fileName) {
					return "run_js requires a non-empty 'code' string or a 'file' with non-empty 'name'";
				}
				const pathError = validateFileToolPath(fileName);
				if (pathError) {
					return formatToolError(
						"E_FILE_PATH_SCOPE",
						pathError,
						FILE_PATH_HELP,
					);
				}
				try {
					const readResult = await fileOp({ op: "read", path: fileName });
					if (readResult.op !== "read") {
						return formatToolError(
							"E_FILE_UNKNOWN",
							`Unexpected result op for file_read: ${readResult.op}`,
							"",
						);
					}
					code = readResult.content;
				} catch (err) {
					return formatFileOpError(err);
				}
			} else {
				code = parsed.data.code ?? "";
			}

			if (!code.trim()) {
				return "run_js requires a non-empty 'code' string";
			}

			if (parsed.data.params !== undefined) {
				code = `globalThis._params = ${JSON.stringify(parsed.data.params)};\n${code}`;
			}

			try {
				const result = await runJs(code);
				const traceId = getCurrentTraceId();
				const tracePrefix = traceId ? `[${traceId}] ` : "";
				if (result.status === "err") {
					const err = result.error as {
						kind: string;
						message?: string;
						action?: string | null;
						code?: string | null;
						stack?: string | null;
						hint?: string | null;
						recovery?: string[] | null;
						details?: Record<string, unknown> | null;
					};
					const {
						code: errCode,
						hint,
						stack,
						details,
					} = classifyError(err, code);
					return formatToolError(
						errCode,
						`${tracePrefix}${formatJsRunResult(result)}`,
						hint,
						stack,
						details,
					);
				}
				const formatted = formatJsRunResult(result);
				const prefixed = tracePrefix
					? formatted
							.split("\n")
							.map((line) => `${tracePrefix}${line}`)
							.join("\n")
					: formatted;
				return prefixed;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				const traceId = getCurrentTraceId();
				const tracePrefix = traceId ? `[${traceId}] ` : "";
				const stack = err instanceof Error && err.stack ? err.stack : undefined;
				const { code: errCode, hint } = classifyError({
					message: msg,
					stack,
				});
				return formatToolError(errCode, `${tracePrefix}${msg}`, hint, stack);
			}
		},
	};
}
