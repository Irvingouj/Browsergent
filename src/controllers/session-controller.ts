import { reportError } from "../errors/report";
import {
	isAgentDiagnosticEvent,
	isAgentTraceEntry,
	isChatMessage,
} from "../protocol/worker-guards";

import type {
	SessionListItem,
	SessionOrigin,
} from "../state/slices/session-slice";
import { browsergentStore } from "../state/store";
import type { StorageBackend } from "../storage/storage-backend";
import type {
	AgentDiagnosticEvent,
	AgentTraceEntry,
	ChatMessage,
} from "../types/messages";
import {
	applyWindowCloseToIndex,
	applyWindowMergeToIndex,
	type SessionIndexEntry,
	type SessionIndexSnapshot,
} from "./session-index-lifecycle";
import {
	type ClaimClosedSessionResult,
	canOpenSessionForWindow,
	formatWindowLabel,
	isClaimableClosedSession,
	type LiveWindowIdsOption,
	listLiveChromeWindowIds,
	type SessionLifecycle,
} from "./session-window-utils";

/** Full persisted chat payload for one session (messages/trace/diagnostics). */
interface SessionData {
	id: string;
	windowId?: number | null;
	lifecycle?: SessionLifecycle;
	origin: SessionOrigin;
	messages: ChatMessage[];
	trace: AgentTraceEntry[];
	diagnostics: AgentDiagnosticEvent[];
	timestamp: number;
	title?: string;
	customTitle?: string;
	messageCount: number;
}

/**
 * Lightweight per-session index for list/find/trim.
 * Avoids deserializing messages/trace/diagnostics when only metadata is needed.
 */
interface StoredSessionMeta {
	id: string;
	windowId: number | null;
	lifecycle: SessionLifecycle;
	origin: SessionOrigin;
	timestamp: number;
	title?: string;
	customTitle?: string;
	messageCount: number;
	/** Approximate serialized size of the full session body in bytes. */
	bytes: number;
}

interface SessionMeta {
	panelActiveSession: Record<string, string>;
	closedWindowIds?: number[];
	/** Per-window running session ids — shared across panels via IDB. */
	runningSessionsByWindow?: Record<string, string[]>;
}

const SESSION_STORE = "sessions";
const META_KEY = "__meta";
/** Full body key: session_<id> */
const SESSION_PREFIX = "session_";
/** Meta index key: session_meta_<id> (must be checked before SESSION_PREFIX matches). */
const SESSION_META_PREFIX = "session_meta_";
const SESSION_CAP = 50;

function sessionBodyKey(id: string): string {
	return `${SESSION_PREFIX}${id}`;
}

function sessionMetaKey(id: string): string {
	return `${SESSION_META_PREFIX}${id}`;
}

function isSessionBodyKey(key: string): boolean {
	return key.startsWith(SESSION_PREFIX) && !key.startsWith(SESSION_META_PREFIX);
}

function sessionIdFromBodyKey(key: string): string {
	return key.slice(SESSION_PREFIX.length);
}

function metaFromSessionData(
	data: SessionData,
	bytes?: number,
): StoredSessionMeta {
	return {
		id: data.id,
		windowId: data.windowId ?? null,
		lifecycle: data.lifecycle ?? "foreground",
		origin: data.origin === "cli" ? "cli" : "chat",
		timestamp: data.timestamp,
		title: data.title,
		customTitle: data.customTitle,
		messageCount: data.messageCount,
		bytes: bytes ?? estimateJsonSize(data),
	};
}

function parseStoredSessionMeta(raw: unknown): StoredSessionMeta | null {
	// Storage boundary: values may be legacy or partially written.
	if (!raw || typeof raw !== "object") return null;
	const v = raw as Record<string, unknown>;
	if (typeof v.id !== "string" || v.id.length === 0) return null;
	if (typeof v.timestamp !== "number" || !Number.isFinite(v.timestamp)) {
		return null;
	}
	if (typeof v.messageCount !== "number" || !Number.isFinite(v.messageCount)) {
		return null;
	}
	const windowId =
		v.windowId === null || v.windowId === undefined
			? null
			: typeof v.windowId === "number"
				? v.windowId
				: null;
	const lifecycle: SessionLifecycle =
		v.lifecycle === "background" ? "background" : "foreground";
	// Missing/invalid bytes forces lazy re-derive from the full body.
	if (
		typeof v.bytes !== "number" ||
		!Number.isFinite(v.bytes) ||
		v.bytes <= 0
	) {
		return null;
	}
	const meta: StoredSessionMeta = {
		id: v.id,
		windowId,
		lifecycle,
		origin: v.origin === "cli" ? "cli" : "chat",
		timestamp: v.timestamp,
		messageCount: Math.max(0, Math.floor(v.messageCount)),
		bytes: v.bytes,
	};
	if (typeof v.title === "string") meta.title = v.title;
	if (typeof v.customTitle === "string") meta.customTitle = v.customTitle;
	return meta;
}

const MAX_DIAGNOSTICS_SIZE_BYTES = 500_000;
const MAX_SSE_DATA_LENGTH = 10_000;
const MAX_SESSION_STORE_BYTES = 5_000_000;
const TRUNCATED_SUFFIX_RE = /\[truncated \d+ bytes\]$/;

type DiagnosticsNormalization =
	| { kind: "unchanged"; diagnostics: AgentDiagnosticEvent[] }
	| { kind: "changed"; diagnostics: AgentDiagnosticEvent[] };

type SessionCleanup = {
	data: SessionData;
	bytes: number;
	changed: boolean;
};

export interface ListSessionsResult {
	sessions: SessionListItem[];
	prunedIds: string[];
}

function estimateJsonSize(value: unknown): number {
	try {
		return new TextEncoder().encode(JSON.stringify(value)).length;
	} catch {
		return Number.MAX_SAFE_INTEGER;
	}
}

function summarizeDiagnosticEvent(
	event: AgentDiagnosticEvent,
): AgentDiagnosticEvent {
	if (
		event.kind === "provider_sse_event" &&
		event.data.length > MAX_SSE_DATA_LENGTH
	) {
		if (TRUNCATED_SUFFIX_RE.test(event.data)) return event;
		return { ...event, data: truncateDiagnosticData(event.data) };
	}
	if (
		event.kind === "provider_sse_remainder" &&
		event.data.length > MAX_SSE_DATA_LENGTH
	) {
		if (TRUNCATED_SUFFIX_RE.test(event.data)) return event;
		return { ...event, data: truncateDiagnosticData(event.data) };
	}
	return event;
}

function truncateDiagnosticData(data: string): string {
	if (TRUNCATED_SUFFIX_RE.test(data)) return data;
	let omitted = data.length - MAX_SSE_DATA_LENGTH;
	let suffix = `... [truncated ${omitted} bytes]`;
	omitted = data.length - Math.max(0, MAX_SSE_DATA_LENGTH - suffix.length);
	suffix = `... [truncated ${omitted} bytes]`;
	return (
		data.slice(0, Math.max(0, MAX_SSE_DATA_LENGTH - suffix.length)) + suffix
	);
}

function trimOversizedDiagnostics(
	diagnostics: AgentDiagnosticEvent[],
	maxBytes: number,
): AgentDiagnosticEvent[] {
	if (diagnostics.length === 0) return diagnostics;
	if (estimateJsonSize(diagnostics) <= maxBytes) return diagnostics;

	let low = 0;
	let high = diagnostics.length;
	let best = 0;
	while (low <= high) {
		const keep = Math.floor((low + high) / 2);
		const size = keep === 0 ? 2 : estimateJsonSize(diagnostics.slice(-keep));
		if (size <= maxBytes) {
			best = keep;
			low = keep + 1;
		} else {
			high = keep - 1;
		}
	}
	return best === 0 ? [] : diagnostics.slice(-best);
}

function normalizeDiagnostics(
	diagnostics: AgentDiagnosticEvent[],
): DiagnosticsNormalization {
	let summarizedChanged = false;
	const summarized = diagnostics.map((event) => {
		const next = summarizeDiagnosticEvent(event);
		if (next !== event) summarizedChanged = true;
		return next;
	});
	const trimmed = trimOversizedDiagnostics(
		summarized,
		MAX_DIAGNOSTICS_SIZE_BYTES,
	);
	const changed = summarizedChanged || trimmed.length !== summarized.length;
	return {
		kind: changed ? "changed" : "unchanged",
		diagnostics: trimmed,
	};
}

function emptySessionData(
	id: string,
	windowId?: number | null,
	origin: SessionOrigin = "chat",
): SessionData {
	return {
		id,
		windowId: windowId ?? null,
		lifecycle: "foreground",
		origin,
		messages: [],
		trace: [],
		diagnostics: [],
		timestamp: Date.now(),
		messageCount: 0,
	};
}

function ensureMeta(raw: SessionMeta | null | undefined): SessionMeta {
	if (raw && typeof raw === "object") {
		return {
			panelActiveSession:
				raw.panelActiveSession && typeof raw.panelActiveSession === "object"
					? { ...raw.panelActiveSession }
					: {},
			closedWindowIds: Array.isArray(raw.closedWindowIds)
				? [...raw.closedWindowIds]
				: [],
			runningSessionsByWindow:
				raw.runningSessionsByWindow &&
				typeof raw.runningSessionsByWindow === "object"
					? { ...raw.runningSessionsByWindow }
					: undefined,
		};
	}
	return { panelActiveSession: {}, closedWindowIds: [] };
}

export class SessionController {
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private saveFailedReported = false;
	private meta: SessionMeta = { panelActiveSession: {}, closedWindowIds: [] };
	private panelWindowId: number | null = null;
	hydrated = false;

	constructor(private readonly storage: StorageBackend) {}

	private failStore(err: unknown, details: Record<string, unknown>): void {
		const message = err instanceof Error ? err.message : String(err);
		browsergentStore.getState().sessionStoreFailed({
			code: "E_SESSION_STORE",
			message,
			source: "session",
			details,
		});
		reportError({
			code: "E_HOST_UNKNOWN",
			source: "session",
			message: `Session store failed: ${message}`,
			details,
			cause: err,
		});
	}

	bindPanelWindow(windowId: number): void {
		this.panelWindowId = windowId;
	}

	getPanelWindowId(): number | null {
		return this.panelWindowId;
	}

	getPanelActiveSessionId(windowId: number): string | null {
		return this.meta.panelActiveSession[String(windowId)] ?? null;
	}

	async canOpenSession(
		sessionId: string,
		panelWindowId: number,
	): Promise<boolean> {
		const meta = await this.getOrMigrateSessionMeta(sessionId);
		if (!meta) return false;
		return canOpenSessionForWindow(meta.windowId, panelWindowId);
	}

	/**
	 * C1 + R1: rebind a session whose window is closed *or gone* onto this panel.
	 * Same session id; updates windowId + lifecycle=background.
	 * Refuses live foreign windows (still present in Chrome).
	 */
	async claimClosedSession(
		sessionId: string,
		options?: LiveWindowIdsOption,
	): Promise<ClaimClosedSessionResult> {
		if (this.panelWindowId === null) {
			this.failStore(new Error("claimClosedSession requires bindPanelWindow"), {
				operation: "claimClosedSession",
				sessionId,
			});
			return { ok: false, reason: "unavailable" };
		}
		const panelWindowId = this.panelWindowId;
		const meta = await this.getOrMigrateSessionMeta(sessionId);
		if (!meta) return { ok: false, reason: "unavailable" };
		const closed = new Set(this.meta.closedWindowIds ?? []);
		const fromWid = meta.windowId;
		if (fromWid === null || fromWid === undefined) {
			return { ok: false, reason: "unavailable" };
		}
		if (fromWid === panelWindowId) return { ok: true };

		let live: Set<number> | undefined =
			options?.liveWindowIds !== undefined
				? new Set(options.liveWindowIds)
				: undefined;
		if (!live) {
			const ids = await listLiveChromeWindowIds();
			if (ids) live = new Set(ids);
		}
		if (live?.has(fromWid)) {
			return { ok: false, reason: "live_foreign" };
		}
		if (!isClaimableClosedSession(fromWid, panelWindowId, closed, live)) {
			return { ok: false, reason: "unavailable" };
		}

		// Remember closed so labels stay consistent after claim.
		if (!closed.has(fromWid)) {
			this.meta.closedWindowIds = [...closed, fromWid];
			await this.persistMeta();
		}

		const data = await this.getSessionRecord(sessionId);
		if (data) {
			data.windowId = panelWindowId;
			data.lifecycle = "background";
			await this.persistSessionBody(data);
		} else {
			await this.writeSessionMeta({
				...meta,
				windowId: panelWindowId,
				lifecycle: "background",
			});
		}
		return { ok: true };
	}

	async getSessionRecord(id: string): Promise<SessionData | null> {
		const raw = await this.storage.get<SessionData>(
			SESSION_STORE,
			sessionBodyKey(id),
		);
		if (!raw || typeof raw !== "object" || !raw.id) return null;
		return raw;
	}

	private async writeSessionMeta(meta: StoredSessionMeta): Promise<void> {
		await this.storage.set(SESSION_STORE, sessionMetaKey(meta.id), meta);
	}

	private async removeSessionKeys(id: string): Promise<void> {
		await this.storage.remove(SESSION_STORE, sessionBodyKey(id));
		await this.storage.remove(SESSION_STORE, sessionMetaKey(id));
	}

	private async persistSessionBody(data: SessionData): Promise<void> {
		const bytes = estimateJsonSize(data);
		await this.storage.set(SESSION_STORE, sessionBodyKey(data.id), data);
		await this.writeSessionMeta(metaFromSessionData(data, bytes));
	}

	/**
	 * Read meta index; if missing, derive once from the full body and backfill.
	 */
	private async getOrMigrateSessionMeta(
		id: string,
	): Promise<StoredSessionMeta | null> {
		const rawMeta = await this.storage.get<unknown>(
			SESSION_STORE,
			sessionMetaKey(id),
		);
		const parsed = parseStoredSessionMeta(rawMeta);
		if (parsed) return parsed;

		const full = await this.getSessionRecord(id);
		if (!full) return null;
		const cleanup = this.cleanupStoredSession(full);
		if (cleanup.changed) {
			await this.storage.set(
				SESSION_STORE,
				sessionBodyKey(cleanup.data.id),
				cleanup.data,
			);
		}
		const meta = metaFromSessionData(cleanup.data, cleanup.bytes);
		await this.writeSessionMeta(meta);
		return meta;
	}

	private async listAllSessionMetas(): Promise<StoredSessionMeta[]> {
		const keys = await this.storage.getAllKeys(SESSION_STORE);
		// Prefer lightweight session_meta_* rows (no body deserialize).
		const metaIds = new Set(
			keys
				.filter((k) => k.startsWith(SESSION_META_PREFIX))
				.map((k) => k.slice(SESSION_META_PREFIX.length)),
		);
		const bodyIds = keys.filter(isSessionBodyKey).map(sessionIdFromBodyKey);
		const metas: StoredSessionMeta[] = [];
		const seen = new Set<string>();

		for (const id of metaIds) {
			const rawMeta = await this.storage.get<unknown>(
				SESSION_STORE,
				sessionMetaKey(id),
			);
			const parsed = parseStoredSessionMeta(rawMeta);
			if (parsed) {
				metas.push(parsed);
				seen.add(id);
			}
		}

		// Migrate only bodies that still lack a meta row (idle / first open after upgrade).
		for (const id of bodyIds) {
			if (seen.has(id)) continue;
			const meta = await this.getOrMigrateSessionMeta(id);
			if (meta) {
				metas.push(meta);
			} else {
				// Corrupt or empty body key — drop body + any orphan meta.
				await this.removeSessionKeys(id);
			}
		}
		return metas;
	}

	async refreshMeta(): Promise<void> {
		const stored = await this.storage.get<SessionMeta>(SESSION_STORE, META_KEY);
		this.meta = ensureMeta(stored);
	}

	getGlobalRunningSessionIds(): string[] {
		const byWindow = this.meta.runningSessionsByWindow ?? {};
		const ids = new Set<string>();
		for (const sessions of Object.values(byWindow)) {
			for (const id of sessions) ids.add(id);
		}
		return [...ids];
	}

	async updateRunningSessionsForWindow(
		windowId: number,
		sessionIds: string[],
	): Promise<void> {
		const key = String(windowId);
		const next = { ...(this.meta.runningSessionsByWindow ?? {}) };
		if (sessionIds.length === 0) {
			delete next[key];
		} else {
			next[key] = sessionIds;
		}
		this.meta.runningSessionsByWindow =
			Object.keys(next).length > 0 ? next : undefined;
		await this.persistMeta();
	}

	private initPromise: Promise<void> | null = null;
	private metaLoaded = false;

	async init(): Promise<void> {
		// Meta only — do not trim/list all session bodies on cold boot (B8/B9).
		// Trim runs after shell is painted via scheduleIdleTrim().
		if (this.metaLoaded) return;
		// Dedup concurrent init() so multi-window boot does not stack IDB gets.
		if (!this.initPromise) {
			this.initPromise = this.refreshMeta()
				.then(() => {
					this.metaLoaded = true;
				})
				.finally(() => {
					this.initPromise = null;
				});
		}
		await this.initPromise;
	}

	/** True after a successful refreshMeta (panelActiveSession trustworthy). */
	isMetaLoaded(): boolean {
		return this.metaLoaded;
	}

	/** Yield to the event loop, then evict oversized session bodies (non-blocking boot). */
	scheduleIdleTrim(): void {
		const run = () => {
			void this.trimStoredSessions().catch((err) => {
				this.failStore(err, { operation: "idleTrim" });
			});
		};
		if (typeof requestIdleCallback === "function") {
			requestIdleCallback(() => run(), { timeout: 5_000 });
		} else {
			setTimeout(run, 0);
		}
	}

	async resolveOrCreateForWindow(windowId: number): Promise<string> {
		this.bindPanelWindow(windowId);
		const key = String(windowId);
		const existingPanelId = this.meta.panelActiveSession[key];
		if (existingPanelId) {
			// Trust in-memory meta first (already loaded via init). Optional body check:
			const meta = await this.getOrMigrateSessionMeta(existingPanelId);
			if (meta && meta.windowId === windowId) {
				return existingPanelId;
			}
			// Meta row missing but panelActive points here — still return id if body exists.
			const body = await this.getSessionRecord(existingPanelId);
			if (body && (body.windowId === windowId || body.windowId == null)) {
				return existingPanelId;
			}
			// Ephemeral attach claimed this id before IDB body existed. Persist it
			// instead of minting a second id (which would orphan in-flight UI work).
			await this.persistEphemeralSession(windowId, existingPanelId);
			return existingPanelId;
		}

		const attached = await this.findSessionsForWindow(windowId);
		if (attached.length > 0) {
			const foreground = attached.find((s) => s.lifecycle === "foreground");
			const pick = foreground ?? attached[0];
			if (pick) {
				this.meta.panelActiveSession[key] = pick.id;
				await this.persistMeta();
				return pick.id;
			}
		}

		return this.createSessionAttachedTo(windowId);
	}

	async createSessionAttachedTo(
		windowId: number,
		origin: SessionOrigin = "chat",
	): Promise<string> {
		this.bindPanelWindow(windowId);
		if (origin === "chat") {
			const attached = await this.findSessionsForWindow(windowId);
			for (const session of attached) {
				if (session.lifecycle === "foreground") {
					await this.setSessionLifecycle(session.id, "background");
				}
			}
		}

		const newId = crypto.randomUUID();
		const empty = emptySessionData(newId, windowId, origin);
		if (origin === "cli") empty.lifecycle = "background";
		await this.persistSessionBody(empty);
		if (origin === "chat") {
			this.meta.panelActiveSession[String(windowId)] = newId;
			await this.persistMeta();
		}
		await this.trimStoredSessions();
		return newId;
	}

	/**
	 * Fast attach for boot fallback: no list/trim (avoids multi-window IDB stalls).
	 */
	async createSessionAttachedToFast(windowId: number): Promise<string> {
		this.bindPanelWindow(windowId);
		const newId = crypto.randomUUID();
		const empty = emptySessionData(newId, windowId);
		await this.persistSessionBody(empty);
		this.meta.panelActiveSession[String(windowId)] = newId;
		await this.persistMeta();
		return newId;
	}

	/**
	 * In-memory attach only (no IDB). Used when storage is stuck so shell can paint.
	 * Background persist should follow when IDB is healthy via persistEphemeralSession.
	 */
	adoptEphemeralSession(windowId: number, sessionId?: string): string {
		this.bindPanelWindow(windowId);
		const id = sessionId ?? crypto.randomUUID();
		this.meta.panelActiveSession[String(windowId)] = id;
		return id;
	}

	/** Persist a previously adopted ephemeral session id (same id — no second mint). */
	async persistEphemeralSession(
		windowId: number,
		sessionId: string,
	): Promise<void> {
		this.bindPanelWindow(windowId);
		const existing = await this.getSessionRecord(sessionId);
		if (!existing) {
			await this.persistSessionBody(emptySessionData(sessionId, windowId));
		}
		this.meta.panelActiveSession[String(windowId)] = sessionId;
		await this.persistMeta();
	}

	private toIndexSnapshot(metas: StoredSessionMeta[]): SessionIndexSnapshot {
		const sessions: SessionIndexEntry[] = metas.map((m) => ({
			id: m.id,
			windowId: m.windowId,
			lifecycle: m.lifecycle,
			timestamp: m.timestamp,
			title: m.title,
			customTitle: m.customTitle,
			messageCount: m.messageCount,
			bytes: m.bytes,
		}));
		return {
			sessions,
			meta: {
				panelActiveSession: { ...this.meta.panelActiveSession },
				closedWindowIds: [...(this.meta.closedWindowIds ?? [])],
				runningSessionsByWindow: this.meta.runningSessionsByWindow
					? { ...this.meta.runningSessionsByWindow }
					: undefined,
			},
		};
	}

	async applyWindowMerge(
		removedWindowId: number,
		survivorWindowId: number,
	): Promise<void> {
		const metas = await this.listAllSessionMetas();
		const next = applyWindowMergeToIndex(
			this.toIndexSnapshot(metas),
			removedWindowId,
			survivorWindowId,
		);
		// Persist body+meta for rebinding sessions (pure reducer is source of truth).
		for (const entry of next.sessions) {
			const prev = metas.find((m) => m.id === entry.id);
			if (
				!prev ||
				(prev.windowId === entry.windowId && prev.lifecycle === entry.lifecycle)
			) {
				continue;
			}
			const data = await this.getSessionRecord(entry.id);
			if (!data) continue;
			data.windowId = entry.windowId;
			data.lifecycle = entry.lifecycle;
			await this.persistSessionBody(data);
		}
		this.meta.panelActiveSession = next.meta.panelActiveSession;
		this.meta.closedWindowIds = next.meta.closedWindowIds;
		this.meta.runningSessionsByWindow = next.meta.runningSessionsByWindow;
		await this.persistMeta();
	}

	async applyWindowClose(removedWindowId: number): Promise<void> {
		const metas = await this.listAllSessionMetas();
		const next = applyWindowCloseToIndex(
			this.toIndexSnapshot(metas),
			removedWindowId,
		);
		this.meta.panelActiveSession = next.meta.panelActiveSession;
		this.meta.closedWindowIds = next.meta.closedWindowIds;
		this.meta.runningSessionsByWindow = next.meta.runningSessionsByWindow;
		await this.persistMeta();
	}

	async clearRunningSessionsForWindow(windowId: number): Promise<void> {
		await this.updateRunningSessionsForWindow(windowId, []);
	}

	getActiveSessionId(): string | null {
		if (this.panelWindowId === null) return null;
		return this.meta.panelActiveSession[String(this.panelWindowId)] ?? null;
	}

	async load(): Promise<{
		messages: ChatMessage[];
		trace: AgentTraceEntry[];
		diagnostics: AgentDiagnosticEvent[];
	} | null> {
		try {
			const activeId = this.getActiveSessionId();
			if (!activeId) return null;
			return await this.loadForId(activeId);
		} catch (err) {
			this.failStore(err, { operation: "load" });
			return null;
		}
	}

	async loadForSession(id: string): Promise<{
		messages: ChatMessage[];
		trace: AgentTraceEntry[];
		diagnostics: AgentDiagnosticEvent[];
	} | null> {
		return this.loadForId(id);
	}

	async setSessionLifecycle(
		sessionId: string,
		lifecycle: SessionLifecycle,
	): Promise<void> {
		const record = await this.getSessionRecord(sessionId);
		if (!record) return;
		record.lifecycle = lifecycle;
		await this.persistSessionBody(record);
	}

	async saveForSession(
		sessionId: string,
		messages: ChatMessage[],
		trace: AgentTraceEntry[],
		diagnostics: AgentDiagnosticEvent[] = [],
	): Promise<void> {
		const existing = await this.getSessionRecord(sessionId);
		// Ephemeral sessions may not have a body yet — upsert rather than silent no-op.
		const base =
			existing ?? emptySessionData(sessionId, this.panelWindowId ?? null);

		const trimmedDiagnostics = normalizeDiagnostics(diagnostics).diagnostics;
		const data: SessionData = {
			...base,
			messages,
			trace,
			diagnostics: trimmedDiagnostics,
			timestamp: Date.now(),
			messageCount: messages.length,
		};

		try {
			await this.persistSessionBody(data);
		} catch (err) {
			this.failStore(err, { operation: "save", sessionId });
		}
	}

	private async findSessionsForWindow(
		windowId: number,
	): Promise<StoredSessionMeta[]> {
		const metas = await this.listAllSessionMetas();
		const out = metas.filter((m) => m.windowId === windowId);
		out.sort((a, b) => b.timestamp - a.timestamp);
		return out;
	}

	private async persistMeta(): Promise<void> {
		await this.storage.set(SESSION_STORE, META_KEY, this.meta);
	}

	/**
	 * Evict oldest non-active sessions when total stored bytes exceed the budget.
	 * Uses meta.bytes only — does not keep full SessionData arrays in memory.
	 * Missing meta is migrated one session at a time via getOrMigrateSessionMeta.
	 */
	private async trimStoredSessions(): Promise<void> {
		const metas = await this.listAllSessionMetas();
		const activeId = this.getActiveSessionId();
		let totalBytes = metas.reduce((sum, m) => sum + m.bytes, 0);
		if (totalBytes <= MAX_SESSION_STORE_BYTES) return;

		const oldestFirst = [...metas].sort((a, b) => a.timestamp - b.timestamp);
		for (const session of oldestFirst) {
			if (session.id === activeId) continue;
			await this.removeSessionKeys(session.id);
			totalBytes -= session.bytes;
			if (totalBytes <= MAX_SESSION_STORE_BYTES) return;
		}
	}

	private cleanupStoredSession(raw: SessionData): SessionCleanup {
		const messages = Array.isArray(raw.messages)
			? raw.messages.filter(isChatMessage)
			: [];
		const trace = Array.isArray(raw.trace)
			? raw.trace.filter(isAgentTraceEntry)
			: [];
		const rawDiagnostics = Array.isArray(raw.diagnostics)
			? raw.diagnostics.filter(isAgentDiagnosticEvent)
			: [];
		const normalized = normalizeDiagnostics(rawDiagnostics);
		const data: SessionData = {
			...raw,
			messages,
			trace,
			diagnostics: normalized.diagnostics,
			messageCount: messages.length,
		};
		const changed =
			messages.length !==
				(Array.isArray(raw.messages) ? raw.messages.length : 0) ||
			trace.length !== (Array.isArray(raw.trace) ? raw.trace.length : 0) ||
			rawDiagnostics.length !==
				(Array.isArray(raw.diagnostics) ? raw.diagnostics.length : 0) ||
			normalized.kind === "changed" ||
			raw.messageCount !== messages.length;
		return { data, bytes: estimateJsonSize(data), changed };
	}

	private async loadForId(id: string): Promise<{
		messages: ChatMessage[];
		trace: AgentTraceEntry[];
		diagnostics: AgentDiagnosticEvent[];
	} | null> {
		const raw = await this.storage.get<SessionData>(
			SESSION_STORE,
			sessionBodyKey(id),
		);
		if (!raw || typeof raw !== "object") return null;
		if (!Array.isArray(raw.messages) || !Array.isArray(raw.trace)) return null;

		const rawDiagnostics: unknown[] = Array.isArray(raw.diagnostics)
			? raw.diagnostics
			: [];
		const validated = rawDiagnostics.filter(isAgentDiagnosticEvent);

		const normalized = normalizeDiagnostics(validated);
		const messages = raw.messages.filter(isChatMessage);
		const trace = raw.trace.filter(isAgentTraceEntry);

		if (normalized.kind === "changed") {
			const patched: SessionData = {
				...raw,
				messages,
				trace,
				diagnostics: normalized.diagnostics,
			};
			this.persistSessionBody(patched).catch((err) => {
				this.failStore(err, { operation: "save" });
			});
		}

		return { messages, trace, diagnostics: normalized.diagnostics };
	}

	scheduleSave(
		messages: ChatMessage[],
		trace: AgentTraceEntry[],
		diagnostics: AgentDiagnosticEvent[] = [],
	): void {
		if (!this.hydrated) return;
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
		}
		this.saveTimer = setTimeout(() => {
			void this.save(messages, trace, diagnostics);
		}, 500);
	}

	cancelPendingSave(): void {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
	}

	async flushSave(
		messages: ChatMessage[],
		trace: AgentTraceEntry[],
		diagnostics: AgentDiagnosticEvent[] = [],
	): Promise<void> {
		this.cancelPendingSave();
		if (!this.hydrated) return;
		await this.save(messages, trace, diagnostics);
	}

	async save(
		messages: ChatMessage[],
		trace: AgentTraceEntry[],
		diagnostics: AgentDiagnosticEvent[] = [],
	): Promise<void> {
		const activeId = this.getActiveSessionId();
		const trimmedDiagnostics = normalizeDiagnostics(diagnostics).diagnostics;
		if (!activeId) return;

		const existing = await this.getSessionRecord(activeId);

		const buildSnapshot = (diags: AgentDiagnosticEvent[]): SessionData => ({
			id: activeId,
			windowId: existing?.windowId ?? this.panelWindowId,
			lifecycle: existing?.lifecycle ?? "foreground",
			origin: existing?.origin === "cli" ? "cli" : "chat",
			messages,
			trace,
			diagnostics: diags,
			timestamp: Date.now(),
			messageCount: messages.length,
			title: existing?.title,
			customTitle: existing?.customTitle,
		});

		try {
			await this.persistSessionBody(buildSnapshot(trimmedDiagnostics));
			this.saveFailedReported = false;
		} catch (err) {
			if (this.saveFailedReported) return;
			this.saveFailedReported = true;
			if (trimmedDiagnostics.length === 0) {
				this.failStore(err, { operation: "save" });
				return;
			}
			try {
				await this.persistSessionBody(buildSnapshot([]));
			} catch (retryErr) {
				this.failStore(retryErr, { operation: "save", retry: true });
			}
		}
	}

	async clear(): Promise<void> {
		try {
			const activeId = this.getActiveSessionId();
			if (!activeId) return;
			await this.removeSessionKeys(activeId);
		} catch (err) {
			this.failStore(err, { operation: "clear" });
		}
	}

	async createSession(origin: SessionOrigin = "chat"): Promise<string> {
		if (this.panelWindowId === null) {
			throw new Error("createSession requires bindPanelWindow");
		}
		return this.createSessionAttachedTo(this.panelWindowId, origin);
	}

	async switchSession(id: string): Promise<{
		messages: ChatMessage[];
		trace: AgentTraceEntry[];
		diagnostics: AgentDiagnosticEvent[];
	} | null> {
		if (this.panelWindowId === null) {
			throw new Error("switchSession requires bindPanelWindow");
		}
		if (!(await this.canOpenSession(id, this.panelWindowId))) {
			return null;
		}
		const data = await this.loadForId(id);
		if (!data) return null;

		this.meta.panelActiveSession[String(this.panelWindowId)] = id;
		await this.persistMeta();
		return data;
	}

	async deleteSession(id: string): Promise<void> {
		if (this.panelWindowId === null) {
			throw new Error("deleteSession requires bindPanelWindow");
		}
		if (!(await this.canOpenSession(id, this.panelWindowId))) {
			return;
		}

		await this.removeSessionKeys(id);

		if (this.getActiveSessionId() === id) {
			const { sessions: remaining } = await this.listSessions(
				this.panelWindowId ?? undefined,
			);
			const openable = remaining.filter((s) => s.openable);
			if (openable.length > 0) {
				const nextId = openable[0]?.id;
				if (nextId) {
					this.meta.panelActiveSession[String(this.panelWindowId)] = nextId;
				}
			} else {
				await this.createSessionAttachedTo(this.panelWindowId);
			}
			await this.persistMeta();
		}
	}

	async listSessions(
		panelWindowId?: number,
		options?: LiveWindowIdsOption,
	): Promise<ListSessionsResult> {
		const sessions = await this.listAllSessionMetas();
		sessions.sort((a, b) => b.timestamp - a.timestamp);

		const prunedIds: string[] = [];
		if (sessions.length > SESSION_CAP) {
			const toDelete = sessions.slice(SESSION_CAP);
			for (const s of toDelete) {
				prunedIds.push(s.id);
				await this.removeSessionKeys(s.id);
			}
			sessions.length = SESSION_CAP;
		}

		const closed = new Set(this.meta.closedWindowIds ?? []);
		const live =
			options?.liveWindowIds !== undefined
				? new Set(options.liveWindowIds)
				: undefined;

		return {
			sessions: sessions.map((s) => {
				const openable =
					panelWindowId === undefined
						? true
						: canOpenSessionForWindow(s.windowId, panelWindowId);
				const claimable = isClaimableClosedSession(
					s.windowId,
					panelWindowId,
					closed,
					live,
				);
				return {
					id: s.id,
					title: s.customTitle || s.title || `Session ${s.id.slice(0, 8)}`,
					timestamp: s.timestamp,
					messageCount: s.messageCount,
					origin: s.origin === "cli" ? "cli" : "chat",
					windowId: s.windowId,
					windowLabel: formatWindowLabel(s.windowId, closed, live),
					lifecycle: s.lifecycle,
					openable,
					claimable,
				};
			}),
			prunedIds,
		};
	}

	async updateTitle(
		id: string,
		title: string,
		isCustom = false,
	): Promise<void> {
		const data = await this.getSessionRecord(id);
		if (!data) return;
		if (isCustom) {
			data.customTitle = title;
		} else {
			data.title = title;
		}
		await this.persistSessionBody(data);
	}
}
