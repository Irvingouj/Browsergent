import {
	isAgentDiagnosticEvent,
	isAgentTraceEntry,
	isChatMessage,
} from "../protocol/worker-guards";
import { isFileNode, type FileNode } from "../state/slices/files-slice";
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
	filesIndex?: FileNode[];
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

export interface ListSessionsResult {
	sessions: SessionListItem[];
	prunedIds: string[];
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
	}

	getActiveSessionId(): string | null {
		return this.meta?.activeSessionId ?? null;
	}

	async load(): Promise<{
		messages: ChatMessage[];
		trace: AgentTraceEntry[];
		diagnostics: AgentDiagnosticEvent[];
		filesIndex?: FileNode[];
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

	private async loadForId(id: string): Promise<{
		messages: ChatMessage[];
		trace: AgentTraceEntry[];
		diagnostics: AgentDiagnosticEvent[];
		filesIndex?: FileNode[];
	} | null> {
		const raw = await this.storage.get<SessionData>(
			SESSION_STORE,
			`${SESSION_PREFIX}${id}`,
		);
		if (!raw || typeof raw !== "object") return null;
		if (!Array.isArray(raw.messages) || !Array.isArray(raw.trace)) return null;
		return {
			messages: raw.messages.filter(isChatMessage),
			trace: raw.trace.filter(isAgentTraceEntry),
			diagnostics: Array.isArray(raw.diagnostics)
				? raw.diagnostics.filter(isAgentDiagnosticEvent)
				: [],
			filesIndex: Array.isArray(raw.filesIndex)
			? raw.filesIndex.filter(isFileNode)
			: undefined,
		};
	}

	scheduleSave(
		messages: ChatMessage[],
		trace: AgentTraceEntry[],
		diagnostics: AgentDiagnosticEvent[] = [],
		filesIndex?: FileNode[],
	): void {
		if (!this.hydrated) return;
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
		}
		this.saveTimer = setTimeout(() => {
			void this.save(messages, trace, diagnostics, filesIndex);
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
		filesIndex?: FileNode[],
	): Promise<void> {
		this.cancelPendingSave();
		if (!this.hydrated) return;
		await this.save(messages, trace, diagnostics, filesIndex);
	}

	async save(
		messages: ChatMessage[],
		trace: AgentTraceEntry[],
		diagnostics: AgentDiagnosticEvent[] = [],
		filesIndex?: FileNode[],
	): Promise<void> {
		try {
			const activeId = this.meta?.activeSessionId;
			const snapshot: SessionData = {
				id: activeId || crypto.randomUUID(),
				messages,
				trace,
				diagnostics,
				filesIndex,
				timestamp: Date.now(),
				messageCount: messages.length,
			};
			if (activeId) {
				await this.storage.set(
					SESSION_STORE,
					`${SESSION_PREFIX}${activeId}`,
					snapshot,
				);
			} else {
				await this.storage.set(SESSION_STORE, OLD_SESSION_KEY, snapshot);
			}
		} catch (err) {
			console.warn("Session save failed:", err);
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
		return newId;
	}

	async switchSession(id: string): Promise<{
		messages: ChatMessage[];
		trace: AgentTraceEntry[];
		diagnostics: AgentDiagnosticEvent[];
		filesIndex?: FileNode[];
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
