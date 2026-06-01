import type { JsRunResult } from "@pi-oxide/extension-js";

// Alias for backward compatibility with the rest of the codebase
export type LuaRunResult = JsRunResult;

type WasmCellError = Extract<LuaRunResult, { status: "err" }>["error"];

export function formatCellResult(cell: LuaRunResult): string {
	if (cell.status === "err") {
		const errorPrefix = formatError(cell.error);
		const stderr = cell.stderr.join("\n");
		return stderr ? `${errorPrefix}\n${stderr}` : errorPrefix;
	}

	const parts: string[] = [];
	const stdout = cell.stdout.join("\n");
	if (stdout) parts.push(stdout);
	if (cell.result !== null) parts.push(cell.result);
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
		case "runtime":
			return error.line !== null
				? `[runtime error] line ${error.line}: ${error.message}`
				: `[runtime error] ${error.message}`;
		case "internal":
			return `[internal error] ${error.message}`;
		default:
			return `[unknown error] ${(error as { message?: string }).message ?? ""}`;
	}
}
