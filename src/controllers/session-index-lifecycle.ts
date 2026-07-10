/**
 * Pure session-index lifecycle outcomes for window split/merge/close.
 * No Chrome / IDB — unit-tested for B2/B3/B4 attachment rules.
 */

import type { SessionLifecycle } from "./session-window-utils";
import { canOpenSessionForWindow } from "./session-window-utils";

/** Lightweight index row (mirrors StoredSessionMeta attachment fields). */
export interface SessionIndexEntry {
	id: string;
	windowId: number | null;
	lifecycle: SessionLifecycle;
	timestamp: number;
	title?: string;
	customTitle?: string;
	messageCount: number;
	bytes: number;
}

export interface PanelMetaState {
	panelActiveSession: Record<string, string>;
	closedWindowIds: number[];
	runningSessionsByWindow?: Record<string, string[]>;
}

export interface SessionIndexSnapshot {
	sessions: SessionIndexEntry[];
	meta: PanelMetaState;
}

export function clonePanelMeta(meta: PanelMetaState): PanelMetaState {
	return {
		panelActiveSession: { ...meta.panelActiveSession },
		closedWindowIds: [...meta.closedWindowIds],
		runningSessionsByWindow: meta.runningSessionsByWindow
			? Object.fromEntries(
					Object.entries(meta.runningSessionsByWindow).map(([k, v]) => [
						k,
						[...v],
					]),
				)
			: undefined,
	};
}

/**
 * B3 — both_on_survivor:
 * All sessions attached to removedWindow move to survivor as background.
 * Survivor's previous foreground stays foreground if still present.
 * panelActiveSession for removed is dropped; closedWindowIds gains removed.
 */
export function applyWindowMergeToIndex(
	snapshot: SessionIndexSnapshot,
	removedWindowId: number,
	survivorWindowId: number,
): SessionIndexSnapshot {
	const meta = clonePanelMeta(snapshot.meta);
	const sessions = snapshot.sessions.map((s) => {
		if (s.windowId !== removedWindowId) return { ...s };
		return {
			...s,
			windowId: survivorWindowId,
			lifecycle: "background" as const,
		};
	});

	const closed = new Set(meta.closedWindowIds);
	closed.add(removedWindowId);
	meta.closedWindowIds = [...closed];

	const removedKey = String(removedWindowId);
	delete meta.panelActiveSession[removedKey];
	if (meta.runningSessionsByWindow?.[removedKey]) {
		const next = { ...meta.runningSessionsByWindow };
		delete next[removedKey];
		meta.runningSessionsByWindow =
			Object.keys(next).length > 0 ? next : undefined;
	}

	return { sessions, meta };
}

/**
 * B6/close: mark window closed; drop panel active + running maps for that window.
 * Session rows keep their windowId for badge "Window N (closed)" until merge rebinds.
 */
export function applyWindowCloseToIndex(
	snapshot: SessionIndexSnapshot,
	removedWindowId: number,
): SessionIndexSnapshot {
	const meta = clonePanelMeta(snapshot.meta);
	const closed = new Set(meta.closedWindowIds);
	closed.add(removedWindowId);
	meta.closedWindowIds = [...closed];

	const key = String(removedWindowId);
	delete meta.panelActiveSession[key];
	if (meta.runningSessionsByWindow?.[key]) {
		const next = { ...meta.runningSessionsByWindow };
		delete next[key];
		meta.runningSessionsByWindow =
			Object.keys(next).length > 0 ? next : undefined;
	}

	return { sessions: snapshot.sessions.map((s) => ({ ...s })), meta };
}

/**
 * B2 — first panel open in a window with no attached sessions:
 * create a new session attached to that window as foreground.
 * Existing foregrounds in that window (if any) become background.
 */
export function planCreateSessionForWindow(
	snapshot: SessionIndexSnapshot,
	windowId: number,
	newSessionId: string,
	timestamp: number,
): SessionIndexSnapshot {
	const meta = clonePanelMeta(snapshot.meta);
	const sessions = snapshot.sessions.map((s) => {
		if (s.windowId !== windowId) return { ...s };
		if (s.lifecycle === "foreground") {
			return { ...s, lifecycle: "background" as const };
		}
		return { ...s };
	});

	sessions.push({
		id: newSessionId,
		windowId,
		lifecycle: "foreground",
		timestamp,
		messageCount: 0,
		bytes: 0,
	});
	meta.panelActiveSession[String(windowId)] = newSessionId;
	return { sessions, meta };
}

/**
 * Resolve which session a panel should open: existing panelActive if valid,
 * else foreground for window, else first attached, else null (caller creates).
 */
export function resolveActiveSessionForWindow(
	snapshot: SessionIndexSnapshot,
	windowId: number,
): string | null {
	const key = String(windowId);
	const preferred = snapshot.meta.panelActiveSession[key];
	if (preferred) {
		const row = snapshot.sessions.find(
			(s) => s.id === preferred && s.windowId === windowId,
		);
		if (row) return preferred;
	}
	const attached = snapshot.sessions
		.filter((s) => s.windowId === windowId)
		.sort((a, b) => b.timestamp - a.timestamp);
	const fg = attached.find((s) => s.lifecycle === "foreground");
	return fg?.id ?? attached[0]?.id ?? null;
}

/** B4 — list item openable flag. */
export function sessionOpenable(
	sessionWindowId: number | null | undefined,
	panelWindowId: number | null,
): boolean {
	return canOpenSessionForWindow(sessionWindowId, panelWindowId);
}

/**
 * After split: no session moves. New window has no attached sessions until
 * first panel open creates one (planCreateSessionForWindow).
 */
export function applyWindowSplitToIndex(
	snapshot: SessionIndexSnapshot,
	_sourceWindowId: number,
	_newWindowId: number,
): SessionIndexSnapshot {
	// Pure no-op on index — documents B2 contract.
	return {
		sessions: snapshot.sessions.map((s) => ({ ...s })),
		meta: clonePanelMeta(snapshot.meta),
	};
}
