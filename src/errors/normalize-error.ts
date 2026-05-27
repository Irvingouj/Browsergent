import type { BrowsergentError } from "./browsergent-error";

export function normalizeLuaError(err: unknown): BrowsergentError {
	if (err instanceof Error) {
		return { code: "E_LUA_RUNTIME", message: err.message, source: "lua" };
	}
	return { code: "E_LUA_RUNTIME", message: String(err), source: "lua" };
}
