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

export interface CellResult {
	stdout: string[];
	stderr: string[];
	result: string | null;
	error: WasmCellError | null;
	execution_count: number;
}

export type WasmCellError =
	| { kind: "compile"; message: string; line: number | null }
	| { kind: "runtime"; message: string }
	| { kind: "strict_mode"; variable: string }
	| { kind: "fuel_exhausted" }
	| { kind: "internal"; message: string };

/** Format a CellResult into a human-readable text string for the agent. */
export function formatCellResult(cell: CellResult): string {
	if (cell.error) {
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
			return `[runtime error] ${error.message}`;
		case "internal":
			return `[internal error] ${error.message}`;
	}
}

/** Patterns that must never appear in Lua code submitted to extension-lua. */
const FORBIDDEN_PATTERNS: ReadonlyArray<{
	pattern: string;
	reason: string;
}> = [
	{
		pattern: "tab.evaluate",
		reason:
			"tab.evaluate allows arbitrary JS execution — forbidden in Browsergent",
	},
	{
		pattern: "tab.execute_script",
		reason:
			"tab.execute_script allows arbitrary JS execution — forbidden in Browsergent",
	},
	{
		pattern: "chrome.scripting.executeScript",
		reason:
			"chrome.scripting.executeScript allows arbitrary JS execution — forbidden in Browsergent",
	},
	{
		pattern: "tab[",
		reason:
			"Bracket access on tab table can bypass static security scanning — use tab.*() directly",
	},
];

/**
 * Scan Lua code for forbidden patterns.
 * Returns an error message if forbidden code is found, or null if safe.
 */
export function scanForUnsafeCode(code: string): string | null {
	for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
		if (code.includes(pattern)) {
			return reason;
		}
	}
	return null;
}

/**
 * Detect likely misuse of page.snapshot (captures the side panel, not the target page).
 * Returns a warning if code uses page.snapshot without also using tab.snapshot.
 */
export function detectPageSnapshotMisuse(code: string): string | null {
	const hasPageSnapshot = code.includes("page.snapshot");
	const hasTabSnapshot = code.includes("tab.snapshot");
	if (hasPageSnapshot && !hasTabSnapshot) {
		return (
			"page.snapshot captures the extension side panel, not the target page. " +
			"Use tab.snapshot(tab_id) instead to capture the active web page."
		);
	}
	return null;
}
