export type SessionLifecycle = "foreground" | "background";

export function formatWindowLabel(
	windowId: number | null | undefined,
	closedWindowIds: ReadonlySet<number>,
): string {
	if (windowId === null || windowId === undefined) {
		return "Unknown window";
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

export const CROSS_WINDOW_SESSION_MESSAGE =
	"This session belongs to another window. Switch to that window to open it.";

/** Merge local supervisor, persisted meta, and cross-panel running maps. */
export function collectRunningSessionIds(
	local: Iterable<string>,
	persisted: Iterable<string>,
	globalBySession: Readonly<Record<string, number>>,
): string[] {
	return [
		...new Set([
			...local,
			...persisted,
			...Object.keys(globalBySession),
		]),
	];
}