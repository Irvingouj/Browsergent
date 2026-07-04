import type { CellResult } from "@pi-oxide/extension-js";
import { isStackUseful } from "../worker/tool-error-result";

export type { CellResult };

type WasmCellError = Extract<CellResult, { status: "err" }>["error"];

export function formatJsRunResult(cell: CellResult): string {
	if (cell.status === "err") {
		const errorPrefix = formatError(cell.error);
		const stderr = cell.stderr.join("\n");
		return stderr ? `${errorPrefix}\n${stderr}` : errorPrefix;
	}

	const parts: string[] = [];
	const stdout = cell.stdout.join("\n");
	if (stdout) parts.push(stdout);
	if (cell.result !== null) {
		parts.push(
			typeof cell.result === "string"
				? cell.result
				: JSON.stringify(cell.result),
		);
	}
	return parts.join("\n");
}

export function formatError(error: WasmCellError): string {
	switch (error.kind) {
		case "compile":
			return error.line !== null
				? `[compile error] line ${error.line}: ${error.message}`
				: `[compile error] ${error.message}`;
		case "fuel_exhausted":
			return "[execution limit reached] possible infinite loop — try a different approach";
		case "js_runtime": {
			const trimmedStack = isStackUseful(error.stack) ? error.stack.trim() : "";
			const message = error.message || trimmedStack;
			const name = error.name ? `${error.name}: ` : "";
			return error.line !== null
				? `[runtime error] line ${error.line}: ${name}${message}`
				: `[runtime error] ${name}${message}`;
		}
		case "api_error": {
			// When action/code exist, Rust already formatted the full message including
			// hint and recovery into error.message (via format_js_exception).
			// Fall back to stack when message is empty so a bare TypeError with no
			// message still surfaces a failure location.
			const trimmedStack = error.stack ? error.stack.trim() : "";
			if (error.action && error.code) {
				return error.message || trimmedStack;
			}
			const message = error.message || trimmedStack;
			return error.line !== null
				? `[runtime error] line ${error.line}: ${message}`
				: `[runtime error] ${message}`;
		}
		case "internal":
			return `[internal error] ${error.message}`;
		default:
			return `[unknown error] ${(error as { message?: string }).message ?? ""}`;
	}
}
