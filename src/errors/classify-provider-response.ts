import type { BrowsergentError } from "./browsergent-error";

/**
 * Classify a non-OK provider HTTP response as a typed BrowsergentError.
 *
 * Shared by title-generation and the Test Connection flow so the status →
 * error-code mapping lives in one place (the error system), not in UI hooks.
 *
 *   401 / 403 → E_PROVIDER_AUTH   (bad or missing API key)
 *   404       → E_PROVIDER_NOT_FOUND (unknown model / endpoint)
 *   other     → E_NETWORK         (transient or generic upstream failure)
 *
 * `upstream` is truncated to 500 chars so a verbose error body can't blow up
 * the error object or the UI that renders it.
 */
export function classifyProviderResponse(
	status: number,
	body: string,
	label = "Provider",
): BrowsergentError {
	const code =
		status === 401 || status === 403
			? "E_PROVIDER_AUTH"
			: status === 404
				? "E_PROVIDER_NOT_FOUND"
				: "E_NETWORK";
	return {
		code,
		message: `${label} request failed (${status})`,
		source: "settings",
		details: { status, upstream: body.slice(0, 500) },
	};
}