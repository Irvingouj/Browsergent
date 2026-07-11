import { reportWarn } from "../errors/report";

export type SessionLifecycle = "foreground" | "background";

/** Options for list/claim paths that need Chrome window liveness. */
export interface LiveWindowIdsOption {
	readonly liveWindowIds?: readonly number[];
}

export type ClaimClosedSessionResult =
	| { readonly ok: true }
	| {
			readonly ok: false;
			readonly reason: "live_foreign" | "unavailable";
	  };

export function formatWindowLabel(
	windowId: number | null | undefined,
	closedWindowIds: ReadonlySet<number>,
	liveWindowIds?: ReadonlySet<number>,
): string {
	if (windowId === null || windowId === undefined) {
		return "Unknown window";
	}
	// When live set is known, it wins over stale closedWindowIds (C1).
	if (liveWindowIds !== undefined) {
		return liveWindowIds.has(windowId)
			? `Window ${windowId}`
			: `Window ${windowId} (closed)`;
	}
	if (closedWindowIds.has(windowId)) {
		return `Window ${windowId} (closed)`;
	}
	return `Window ${windowId}`;
}

export function canOpenSessionForWindow(
	sessionWindowId: number | null | undefined,
	panelWindowId: number | null,
): boolean {
	if (panelWindowId === null) return true;
	if (sessionWindowId === null || sessionWindowId === undefined) return false;
	return sessionWindowId === panelWindowId;
}

/**
 * C1 claim: foreign session whose Chrome window is closed *or gone*.
 * Live membership always vetoes claim (even if closedWindowIds is stale).
 * Without liveWindowIds, only closedWindowIds counts (unit tests / no Chrome).
 */
export function isClaimableClosedSession(
	sessionWindowId: number | null | undefined,
	panelWindowId: number | null | undefined,
	closedWindowIds: ReadonlySet<number>,
	liveWindowIds?: ReadonlySet<number>,
): boolean {
	if (panelWindowId === null || panelWindowId === undefined) return false;
	if (sessionWindowId === null || sessionWindowId === undefined) return false;
	if (sessionWindowId === panelWindowId) return false;
	// Live Chrome window → never claim (C1 hard veto over stale closed meta).
	if (liveWindowIds?.has(sessionWindowId)) return false;
	if (closedWindowIds.has(sessionWindowId)) return true;
	if (liveWindowIds && !liveWindowIds.has(sessionWindowId)) return true;
	return false;
}

/**
 * Enumerate open Chrome window ids for claim/list orphan detection.
 * On failure reports a warn and returns undefined (caller falls back to closed meta only).
 */
export async function listLiveChromeWindowIds(): Promise<number[] | undefined> {
	if (typeof chrome === "undefined" || !chrome.windows?.getAll) {
		return undefined;
	}
	try {
		const wins = await chrome.windows.getAll();
		return wins
			.map((w) => w.id)
			.filter((id): id is number => typeof id === "number" && id > 0);
	} catch (err: unknown) {
		reportWarn({
			code: "E_HOST_UNKNOWN",
			source: "session",
			message: "chrome.windows.getAll failed for claim/list live set",
			cause: err,
		});
		return undefined;
	}
}

export const CROSS_WINDOW_SESSION_MESSAGE =
	"This session belongs to another window. Switch to that window to open it.";

export const CLAIM_SESSION_UNAVAILABLE_MESSAGE =
	"Could not open that session in this window.";

/** Merge local supervisor, persisted meta, and cross-panel running maps. */
export function collectRunningSessionIds(
	local: Iterable<string>,
	persisted: Iterable<string>,
	globalBySession: Readonly<Record<string, number>>,
): string[] {
	return [
		...new Set([...local, ...persisted, ...Object.keys(globalBySession)]),
	];
}
