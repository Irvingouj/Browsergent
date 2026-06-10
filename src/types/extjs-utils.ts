import type { CellResult } from "@pi-oxide/extension-js";

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
		case "runtime": {
			// When action/code exist, Rust already formatted the full message including
			// hint and recovery into error.message (via format_js_exception). Use it as-is.
			if (error.action || error.code) {
				return error.message;
			}
			// For plain runtime errors, compose name + message so the error type is visible.
			const name = error.name ? `${error.name}: ` : "";
			return error.line !== null
				? `[runtime error] line ${error.line}: ${name}${error.message}`
				: `[runtime error] ${name}${error.message}`;
		}
		case "internal":
			return `[internal error] ${error.message}`;
		default:
			return `[unknown error] ${(error as { message?: string }).message ?? ""}`;
	}
}
