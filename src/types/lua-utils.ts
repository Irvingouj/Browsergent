import type { LuaRunResult } from "@pi-oxide/extension-lua";

type WasmCellError = Extract<LuaRunResult, { status: "err" }>["error"];

export function formatCellResult(cell: LuaRunResult): string {
	if (cell.status === "err") {
		const errorPrefix = formatError(cell.error);
		const stderr = cell.stderr.join("\n");
		return stderr ? `${errorPrefix}\n${stderr}` : errorPrefix;
	}

	const parts: string[] = [];
	const stdout = cell.stdout.map((s) => s.line).join("\n");
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
		case "strict_mode":
			return `[strict mode] undefined variable: ${error.variable}`;
		case "runtime":
			return error.line !== null
				? `[runtime error] line ${error.line}: ${error.message}`
				: `[runtime error] ${error.message}`;
		case "internal":
			return `[internal error] ${error.message}`;
	}
}
