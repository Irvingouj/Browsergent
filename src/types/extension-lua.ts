/**
 * Types from @pi-oxide/extension-lua.
 *
 * Re-declared here (instead of importing from node_modules) because:
 * 1. The package ships raw .ts source — Vite handles it, but the .d.ts
 *    is auto-generated and lives inside a nested WASM output path.
 * 2. This gives us a stable, reviewed, Biome-clean type surface that
 *    the rest of Browsergent can import without reaching into the package
 *    internals.
 *
 * Keep in sync with: node_modules/@pi-oxide/extension-lua/extension_lua.d.ts
 */

export type CellResult =
	| {
			status: "ok";
			stdout: string[];
			stderr: string[];
			result: string | null;
			execution_count: number;
	  }
	| {
			status: "err";
			stdout: string[];
			stderr: string[];
			error: WasmCellError;
			execution_count: number;
	  };

export type WasmCellError =
	| { kind: "compile"; message: string; line: number | null }
	| { kind: "runtime"; message: string; line: number | null }
	| { kind: "strict_mode"; variable: string }
	| { kind: "fuel_exhausted" }
	| { kind: "internal"; message: string };

/** Format a CellResult into a human-readable text string for the agent. */
export function formatCellResult(cell: CellResult): string {
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
