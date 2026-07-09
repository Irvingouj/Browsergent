/**
 * Service-worker diagnostics: session-storage ring buffer + re-exports.
 * Panel can read DIAG_RING_KEY after SW death to see last events.
 */

import {
	DIAG_MESSAGE_MAX,
	DIAG_RING_KEY,
	DIAG_RING_MAX,
	type DiagnosticReport,
	installGlobalErrorHandlers,
	onDiagnosticReport,
	reportError,
	reportWarn,
	safeListener,
	sendMessageSafe,
} from "../errors/report";

export {
	DIAG_RING_KEY,
	installGlobalErrorHandlers,
	reportError,
	reportWarn,
	safeListener,
	sendMessageSafe,
};

function sanitizeForStorage(report: DiagnosticReport): DiagnosticReport {
	const details = report.details
		? Object.fromEntries(
				Object.entries(report.details).map(([k, v]) => [
					k,
					typeof v === "string" && v.length > DIAG_MESSAGE_MAX
						? `${v.slice(0, DIAG_MESSAGE_MAX)}…`
						: v,
				]),
			)
		: undefined;
	return {
		...report,
		message:
			report.message.length > DIAG_MESSAGE_MAX
				? `${report.message.slice(0, DIAG_MESSAGE_MAX)}…`
				: report.message,
		details,
	};
}

let ringPersistHooked = false;

/** Mirror error-level reports into chrome.storage.session for post-mortem. */
export function installSwDiagRing(): void {
	if (ringPersistHooked) return;
	ringPersistHooked = true;

	onDiagnosticReport((report) => {
		// Persist errors always; warns only when source is sw/relay/lifecycle
		const persist =
			report.level === "error" ||
			report.source === "sw" ||
			report.source === "relay" ||
			report.source === "lifecycle";
		if (!persist) return;
		void appendSwDiagRing(report);
	});
}

export async function appendSwDiagRing(
	report: DiagnosticReport,
): Promise<void> {
	const storage = globalThis.chrome?.storage?.session;
	if (!storage?.get || !storage?.set) return;

	try {
		const stored = await storage.get(DIAG_RING_KEY);
		const prev = Array.isArray(stored[DIAG_RING_KEY])
			? (stored[DIAG_RING_KEY] as DiagnosticReport[])
			: [];
		const next = [...prev, sanitizeForStorage(report)].slice(-DIAG_RING_MAX);
		await storage.set({ [DIAG_RING_KEY]: next });
	} catch (err) {
		// Avoid recursive reportError storm if storage is broken
		try {
			console.error(
				"[browsergent][error] code=E_SW_STORAGE source=sw message=diag ring persist failed",
				err,
			);
		} catch {
			/* ignore */
		}
	}
}

/** Call once from background entry. */
export function initBackgroundDiagnostics(): void {
	installGlobalErrorHandlers("sw");
	installSwDiagRing();
}
