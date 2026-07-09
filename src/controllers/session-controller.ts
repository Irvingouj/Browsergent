import { reportError } from "../errors/report";
import {
	isAgentDiagnosticEvent,
	isAgentTraceEntry,
	isChatMessage,
} from "../protocol/worker-guards";

import type { SessionListItem } from "../state/slices/session-slice";
import { browsergentStore } from "../state/store";
import type { StorageBackend } from "../storage/storage-backend";
import type {
	AgentDiagnosticEvent,
	AgentTraceEntry,
	ChatMessage,
} from "../types/messages";
import {
	canOpenSessionForWindow,
	formatWindowLabel,
	type SessionLifecycle,
} from "./session-window-utils";

interface SessionData {
	id: string;
	windowId?: number | null;
	lifecycle?: SessionLifecycle;
	messages: ChatMessage[];
	trace: AgentTraceEntry[];
	diagnostics: AgentDiagnosticEvent[];
	timestamp: number;
	title?: string;
	customTitle?: string;
	messageCount: number;
}

interface SessionMeta {
	panelActiveSession: Record<string, string>;
	closedWindowIds?: number[];
	/** Per-window running session ids — shared across panels via IDB. */
	runningSessionsByWindow?: Record<string, string[]>;
}

const SESSION_STORE = "sessions";
const META_KEY = "__meta";
const SESSION_PREFIX = "session_";
const SESSION_CAP = 50;

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

function emptySessionData(id: string, windowId?: number | null): SessionData {
	return {
		id,
		windowId: windowId ?? null,
		lifecycle: "foreground",
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

	private failStore(
		err: unknown,
		details: Record<string, unknown>,
	): void {
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
		const record = await this.getSessionRecord(sessionId);
		if (!record) return false;
		return canOpenSessionForWindow(record.windowId, panelWindowId);
	}

	async getSessionRecord(id: string): Promise<SessionData | null> {
		const raw = await this.storage.get<SessionData>(
			SESSION_STORE,
			`${SESSION_PREFIX}${id}`,
		);
		if (!raw || typeof raw !== "object" || !raw.id) return null;
		return raw;
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

	async init(): Promise<void> {
		await this.refreshMeta();
		await this.trimStoredSessions();
	}

	async resolveOrCreateForWindow(windowId: number): Promise<string> {
		this.bindPanelWindow(windowId);
		const key = String(windowId);
		const existingPanelId = this.meta.panelActiveSession[key];
		if (existingPanelId) {
			const record = await this.getSessionRecord(existingPanelId);
			if (record && record.windowId === windowId) {
				return existingPanelId;
			}
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

	async createSessionAttachedTo(windowId: number): Promise<string> {
		this.bindPanelWindow(windowId);
		const attached = await this.findSessionsForWindow(windowId);
		for (const session of attached) {
			if (session.lifecycle === "foreground") {
				session.lifecycle = "background";
				await this.storage.set(
					SESSION_STORE,
					`${SESSION_PREFIX}${session.id}`,
					session,
				);
			}
		}

		const newId = crypto.randomUUID();
		const empty = emptySessionData(newId, windowId);
		await this.storage.set(SESSION_STORE, `${SESSION_PREFIX}${newId}`, empty);
		this.meta.panelActiveSession[String(windowId)] = newId;
		await this.persistMeta();
		await this.trimStoredSessions();
		return newId;
	}

	async applyWindowMerge(
		removedWindowId: number,
		survivorWindowId: number,
	): Promise<void> {
		const keys = await this.storage.getAllKeys(SESSION_STORE);
		for (const key of keys) {
			if (!key.startsWith(SESSION_PREFIX)) continue;
			const data = await this.storage.get<SessionData>(SESSION_STORE, key);
			if (!data || data.windowId !== removedWindowId) continue;
			data.windowId = survivorWindowId;
			data.lifecycle = "background";
			await this.storage.set(SESSION_STORE, key, data);
		}

		const closed = new Set(this.meta.closedWindowIds ?? []);
		closed.add(removedWindowId);
		this.meta.closedWindowIds = [...closed];

		const panelKey = String(removedWindowId);
		if (this.meta.panelActiveSession[panelKey]) {
			delete this.meta.panelActiveSession[panelKey];
		}
		if (this.meta.runningSessionsByWindow?.[panelKey]) {
			const next = { ...this.meta.runningSessionsByWindow };
			delete next[panelKey];
			this.meta.runningSessionsByWindow =
				Object.keys(next).length > 0 ? next : undefined;
		}

		await this.persistMeta();
	}

	async applyWindowClose(removedWindowId: number): Promise<void> {
		const closed = new Set(this.meta.closedWindowIds ?? []);
		closed.add(removedWindowId);
		this.meta.closedWindowIds = [...closed];

		const panelKey = String(removedWindowId);
		if (this.meta.panelActiveSession[panelKey]) {
			delete this.meta.panelActiveSession[panelKey];
		}
		if (this.meta.runningSessionsByWindow?.[panelKey]) {
			const next = { ...this.meta.runningSessionsByWindow };
			delete next[panelKey];
			this.meta.runningSessionsByWindow =
				Object.keys(next).length > 0 ? next : undefined;
		}

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
		await this.storage.set(
			SESSION_STORE,
			`${SESSION_PREFIX}${sessionId}`,
			record,
		);
	}

	async saveForSession(
		sessionId: string,
		messages: ChatMessage[],
		trace: AgentTraceEntry[],
		diagnostics: AgentDiagnosticEvent[] = [],
	): Promise<void> {
		const existing = await this.getSessionRecord(sessionId);
		if (!existing) return;

		const trimmedDiagnostics = normalizeDiagnostics(diagnostics).diagnostics;
		const data: SessionData = {
			...existing,
			messages,
			trace,
			diagnostics: trimmedDiagnostics,
			timestamp: Date.now(),
			messageCount: messages.length,
		};

		try {
			await this.storage.set(
				SESSION_STORE,
				`${SESSION_PREFIX}${sessionId}`,
				data,
			);
		} catch (err) {
			this.failStore(err, { operation: "save", sessionId });
		}
	}

	private async findSessionsForWindow(
		windowId: number,
	): Promise<SessionData[]> {
		const keys = await this.storage.getAllKeys(SESSION_STORE);
		const out: SessionData[] = [];
		for (const key of keys) {
			if (!key.startsWith(SESSION_PREFIX)) continue;
			const data = await this.storage.get<SessionData>(SESSION_STORE, key);
			if (data?.windowId === windowId) out.push(data);
		}
		out.sort((a, b) => b.timestamp - a.timestamp);
		return out;
	}

	private async persistMeta(): Promise<void> {
		await this.storage.set(SESSION_STORE, META_KEY, this.meta);
	}

	private async trimStoredSessions(): Promise<void> {
		const keys = await this.storage.getAllKeys(SESSION_STORE);
		const activeId = this.getActiveSessionId();
		const sessions: Array<SessionData & { bytes: number }> = [];

		for (const key of keys) {
			if (!key.startsWith(SESSION_PREFIX)) continue;
			const data = await this.storage.get<SessionData>(SESSION_STORE, key);
			if (!data || typeof data !== "object" || !data.id) {
				await this.storage.remove(SESSION_STORE, key);
				continue;
			}
			const cleanup = this.cleanupStoredSession(data);
			if (cleanup.changed) {
				await this.storage.set(
					SESSION_STORE,
					`${SESSION_PREFIX}${cleanup.data.id}`,
					cleanup.data,
				);
			}
			sessions.push({ ...cleanup.data, bytes: cleanup.bytes });
		}

		let totalBytes = sessions.reduce((sum, session) => sum + session.bytes, 0);
		if (totalBytes <= MAX_SESSION_STORE_BYTES) return;

		const oldestFirst = [...sessions].sort((a, b) => a.timestamp - b.timestamp);
		for (const session of oldestFirst) {
			if (session.id === activeId) continue;
			await this.storage.remove(
				SESSION_STORE,
				`${SESSION_PREFIX}${session.id}`,
			);
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
			`${SESSION_PREFIX}${id}`,
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
			this.storage
				.set(SESSION_STORE, `${SESSION_PREFIX}${id}`, patched)
				.catch((err) => {
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
		const key = `${SESSION_PREFIX}${activeId}`;

		const existing = await this.getSessionRecord(activeId);

		const buildSnapshot = (diags: AgentDiagnosticEvent[]): SessionData => ({
			id: activeId,
			windowId: existing?.windowId ?? this.panelWindowId,
			lifecycle: existing?.lifecycle ?? "foreground",
			messages,
			trace,
			diagnostics: diags,
			timestamp: Date.now(),
			messageCount: messages.length,
			title: existing?.title,
			customTitle: existing?.customTitle,
		});

		try {
			await this.storage.set(
				SESSION_STORE,
				key,
				buildSnapshot(trimmedDiagnostics),
			);
			this.saveFailedReported = false;
		} catch (err) {
			if (this.saveFailedReported) return;
			this.saveFailedReported = true;
			if (trimmedDiagnostics.length === 0) {
				this.failStore(err, { operation: "save" });
				return;
			}
			try {
				await this.storage.set(SESSION_STORE, key, buildSnapshot([]));
			} catch (retryErr) {
				this.failStore(retryErr, { operation: "save", retry: true });
			}
		}
	}

	async clear(): Promise<void> {
		try {
			const activeId = this.getActiveSessionId();
			if (!activeId) return;
			await this.storage.remove(
				SESSION_STORE,
				`${SESSION_PREFIX}${activeId}`,
			);
		} catch (err) {
			this.failStore(err, { operation: "clear" });
		}
	}

	async createSession(): Promise<string> {
		if (this.panelWindowId === null) {
			throw new Error("createSession requires bindPanelWindow");
		}
		return this.createSessionAttachedTo(this.panelWindowId);
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

		await this.storage.remove(SESSION_STORE, `${SESSION_PREFIX}${id}`);

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

	async listSessions(panelWindowId?: number): Promise<ListSessionsResult> {
		const keys = await this.storage.getAllKeys(SESSION_STORE);
		const sessionKeys = keys.filter((k) => k.startsWith(SESSION_PREFIX));
		const sessions: SessionData[] = [];
		for (const key of sessionKeys) {
			const data = await this.storage.get<SessionData>(SESSION_STORE, key);
			if (data && typeof data === "object" && data.id) {
				sessions.push(data);
			}
		}

		sessions.sort((a, b) => b.timestamp - a.timestamp);

		const prunedIds: string[] = [];
		if (sessions.length > SESSION_CAP) {
			const toDelete = sessions.slice(SESSION_CAP);
			for (const s of toDelete) {
				prunedIds.push(s.id);
				await this.storage.remove(SESSION_STORE, `${SESSION_PREFIX}${s.id}`);
			}
			sessions.length = SESSION_CAP;
		}

		const closed = new Set(this.meta.closedWindowIds ?? []);

		return {
			sessions: sessions.map((s) => ({
				id: s.id,
				title: s.customTitle || s.title || `Session ${s.id.slice(0, 8)}`,
				timestamp: s.timestamp,
				messageCount: s.messageCount,
				windowId: s.windowId ?? null,
				windowLabel: formatWindowLabel(s.windowId, closed),
				lifecycle: s.lifecycle ?? "foreground",
				openable:
					panelWindowId === undefined
						? true
						: canOpenSessionForWindow(s.windowId, panelWindowId),
			})),
			prunedIds,
		};
	}

	async updateTitle(
		id: string,
		title: string,
		isCustom = false,
	): Promise<void> {
		const data = await this.storage.get<SessionData>(
			SESSION_STORE,
			`${SESSION_PREFIX}${id}`,
		);
		if (!data) return;
		if (isCustom) {
			data.customTitle = title;
		} else {
			data.title = title;
		}
		await this.storage.set(SESSION_STORE, `${SESSION_PREFIX}${id}`, data);
	}
}