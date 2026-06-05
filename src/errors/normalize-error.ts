import type { BrowsergentError } from "./browsergent-error";

export function normalizeJsError(err: unknown): BrowsergentError {
	if (err instanceof Error) {
		return { code: "E_JS_RUNTIME", message: err.message, source: "js" };
	}
	return { code: "E_JS_RUNTIME", message: String(err), source: "js" };
}
