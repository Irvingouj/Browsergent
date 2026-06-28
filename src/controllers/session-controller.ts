import {
	isAgentDiagnosticEvent,
	isAgentTraceEntry,
	isChatMessage,
} from "../protocol/worker-guards";

import type { SessionListItem } from "../state/slices/session-slice";
import type { StorageBackend } from "../storage/storage-backend";
import type {
	AgentDiagnosticEvent,
	AgentTraceEntry,
	ChatMessage,
} from "../types/messages";

interface SessionData {
	id: string;
	messages: ChatMessage[];
	trace: AgentTraceEntry[];
	diagnostics: AgentDiagnosticEvent[];
	timestamp: number;
	title?: string;
	customTitle?: string;
	messageCount: number;
}

interface SessionMeta {
	activeSessionId: string;
}

const SESSION_STORE = "sessions";
const META_KEY = "__meta";
const OLD_SESSION_KEY = "current";
const SESSION_PREFIX = "session_";
const SESSION_CAP = 50;

const MAX_DIAGNOSTICS_SIZE_BYTES = 500_000;
const MAX_SSE_DATA_LENGTH = 10_000;
const MAX_SESSION_STORE_BYTES = 5_000_000;
const TRUNCATED_SUFFIX_RE = /\[truncated \d+ bytes\]$/;

type DiagnosticsNormalization =
	| { kind: "unchanged"; diagnostics: AgentDiagnosticEvent[] }
	| { kind: "changed"; diagnostics: AgentDiagnosticEvent[] };

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

	for (let keep = diagnostics.length; keep > 0; keep--) {
		if (estimateJsonSize(diagnostics.slice(-keep)) <= maxBytes)
			return diagnostics.slice(-keep);
	}
	return [];
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

export class SessionController {
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private meta: SessionMeta | null = null;
	hydrated = false;

	constructor(private readonly storage: StorageBackend) {}

	async init(): Promise<void> {
		const meta = await this.storage.get<SessionMeta>(SESSION_STORE, META_KEY);
		if (meta?.activeSessionId) {
			this.meta = meta;
			await this.trimStoredSessions();
			return;
		}

		const oldSession = await this.storage.get<{
			messages: unknown[];
			trace: unknown[];
			timestamp: number;
		}>(SESSION_STORE, OLD_SESSION_KEY);

		if (oldSession) {
			const newId = crypto.randomUUID();
			const migrated: SessionData = {
				id: newId,
				messages: Array.isArray(oldSession.messages)
					? oldSession.messages.filter(isChatMessage)
					: [],
				trace: Array.isArray(oldSession.trace)
					? oldSession.trace.filter(isAgentTraceEntry)
					: [],
				diagnostics: [],
				timestamp: oldSession.timestamp || Date.now(),
				messageCount: Array.isArray(oldSession.messages)
					? oldSession.messages.length
					: 0,
			};
			await this.storage.set(
				SESSION_STORE,
				`${SESSION_PREFIX}${newId}`,
				migrated,
			);

			this.meta = { activeSessionId: newId };
			await this.storage.set(SESSION_STORE, META_KEY, this.meta);
			await this.storage.remove(SESSION_STORE, OLD_SESSION_KEY);
		} else {
			const newId = crypto.randomUUID();
			this.meta = { activeSessionId: newId };
			await this.storage.set(SESSION_STORE, META_KEY, this.meta);
			const empty: SessionData = {
				id: newId,
				messages: [],
				trace: [],
				diagnostics: [],
				timestamp: Date.now(),
				messageCount: 0,
			};
			await this.storage.set(SESSION_STORE, `${SESSION_PREFIX}${newId}`, empty);
		}
		await this.trimStoredSessions();
	}

	getActiveSessionId(): string | null {
		return this.meta?.activeSessionId ?? null;
	}

	async load(): Promise<{
		messages: ChatMessage[];
		trace: AgentTraceEntry[];
		diagnostics: AgentDiagnosticEvent[];
	} | null> {
		try {
			const activeId = this.meta?.activeSessionId;
			if (!activeId) return null;
			return await this.loadForId(activeId);
		} catch (err) {
			console.warn("Session load failed:", err);
			return null;
		}
	}

	private async trimStoredSessions(): Promise<void> {
		const keys = await this.storage.getAllKeys(SESSION_STORE);
		const activeId = this.meta?.activeSessionId ?? null;
		const sessions: Array<SessionData & { bytes: number }> = [];

		for (const key of keys) {
			if (!key.startsWith(SESSION_PREFIX)) continue;
			const data = await this.storage.get<SessionData>(SESSION_STORE, key);
			if (!data || typeof data !== "object" || !data.id) {
				await this.storage.remove(SESSION_STORE, key);
				continue;
			}
			const cleanup = this.cleanupStoredSession(data);
			await this.storage.set(
				SESSION_STORE,
				`${SESSION_PREFIX}${cleanup.data.id}`,
				cleanup.data,
			);
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

	private cleanupStoredSession(raw: SessionData): {
		data: SessionData;
		bytes: number;
	} {
		const messages = Array.isArray(raw.messages)
			? raw.messages.filter(isChatMessage)
			: [];
		const trace = Array.isArray(raw.trace)
			? raw.trace.filter(isAgentTraceEntry)
			: [];
		const diagnostics = Array.isArray(raw.diagnostics)
			? normalizeDiagnostics(raw.diagnostics.filter(isAgentDiagnosticEvent))
					.diagnostics
			: [];
		const data: SessionData = {
			...raw,
			messages,
			trace,
			diagnostics,
			messageCount: messages.length,
		};
		return { data, bytes: estimateJsonSize(data) };
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
			// ponytail: best-effort write-back of normalized+filtered session; if lost,
			// next load re-normalizes idempotently.
			const patched: SessionData = {
				...raw,
				messages,
				trace,
				diagnostics: normalized.diagnostics,
			};
			this.storage
				.set(SESSION_STORE, `${SESSION_PREFIX}${id}`, patched)
				.catch((err) => {
					console.warn("Session normalization write-back failed:", err);
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
		const activeId = this.meta?.activeSessionId;
		const trimmedDiagnostics = normalizeDiagnostics(diagnostics).diagnostics;
		const key = activeId ? `${SESSION_PREFIX}${activeId}` : OLD_SESSION_KEY;

		const buildSnapshot = (diags: AgentDiagnosticEvent[]): SessionData => ({
			id: activeId || crypto.randomUUID(),
			messages,
			trace,
			diagnostics: diags,
			timestamp: Date.now(),
			messageCount: messages.length,
		});

		try {
			await this.storage.set(
				SESSION_STORE,
				key,
				buildSnapshot(trimmedDiagnostics),
			);
		} catch (err) {
			if (trimmedDiagnostics.length === 0) {
				console.warn("Session save failed:", err);
				return;
			}
			try {
				await this.storage.set(SESSION_STORE, key, buildSnapshot([]));
			} catch (retryErr) {
				console.warn("Session save retry also failed:", retryErr);
			}
		}
	}

	async clear(): Promise<void> {
		try {
			const activeId = this.meta?.activeSessionId;
			if (activeId) {
				await this.storage.remove(
					SESSION_STORE,
					`${SESSION_PREFIX}${activeId}`,
				);
			} else {
				await this.storage.remove(SESSION_STORE, OLD_SESSION_KEY);
			}
		} catch (err) {
			console.warn("Session clear failed:", err);
		}
	}

	async createSession(): Promise<string> {
		const newId = crypto.randomUUID();
		const empty: SessionData = {
			id: newId,
			messages: [],
			trace: [],
			diagnostics: [],
			timestamp: Date.now(),
			messageCount: 0,
		};
		await this.storage.set(SESSION_STORE, `${SESSION_PREFIX}${newId}`, empty);
		this.meta = { activeSessionId: newId };
		await this.storage.set(SESSION_STORE, META_KEY, this.meta);
		await this.trimStoredSessions();
		return newId;
	}

	async switchSession(id: string): Promise<{
		messages: ChatMessage[];
		trace: AgentTraceEntry[];
		diagnostics: AgentDiagnosticEvent[];
	} | null> {
		const data = await this.loadForId(id);
		if (!data) return null;
		this.meta = { activeSessionId: id };
		await this.storage.set(SESSION_STORE, META_KEY, this.meta);
		return data;
	}

	async deleteSession(id: string): Promise<void> {
		await this.storage.remove(SESSION_STORE, `${SESSION_PREFIX}${id}`);

		if (this.meta?.activeSessionId === id) {
			const { sessions: remaining } = await this.listSessions();
			if (remaining.length > 0) {
				this.meta = {
					activeSessionId: remaining[0]?.id ?? crypto.randomUUID(),
				};
			} else {
				const newId = crypto.randomUUID();
				this.meta = { activeSessionId: newId };
				const empty: SessionData = {
					id: newId,
					messages: [],
					trace: [],
					diagnostics: [],
					timestamp: Date.now(),
					messageCount: 0,
				};
				await this.storage.set(
					SESSION_STORE,
					`${SESSION_PREFIX}${newId}`,
					empty,
				);
			}
			await this.storage.set(SESSION_STORE, META_KEY, this.meta);
		}
	}

	async listSessions(): Promise<ListSessionsResult> {
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

		return {
			sessions: sessions.map((s) => ({
				id: s.id,
				title: s.customTitle || s.title || `Session ${s.id.slice(0, 8)}`,
				timestamp: s.timestamp,
				messageCount: s.messageCount,
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
