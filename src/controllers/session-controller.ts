import type { StorageBackend } from "../storage/storage-backend";
import type { AgentTraceEntry, ChatMessage } from "../types/messages";

interface SessionData {
	id: string;
	messages: ChatMessage[];
	trace: AgentTraceEntry[];
	timestamp: number;
	title?: string;
	customTitle?: string;
	messageCount: number;
}

interface SessionMeta {
	activeSessionId: string;
}

export interface SessionListItem {
	id: string;
	title: string;
	timestamp: number;
	messageCount: number;
}

const SESSION_STORE = "sessions";
const HISTORY_STORE = "history";
const META_KEY = "__meta";
const OLD_SESSION_KEY = "current";
const OLD_HISTORY_KEY = "current";
const SESSION_PREFIX = "session_";
const SESSION_CAP = 50;

function isValidHistoryEntry(m: unknown): m is { role: "user" | "assistant"; content: string } {
	if (m === null || typeof m !== "object") return false;
	const rec = m as Record<string, unknown>;
	return (
		"role" in rec &&
		"content" in rec &&
		(rec.role === "user" || rec.role === "assistant") &&
		typeof rec.content === "string"
	);
}

export class SessionController {
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private meta: SessionMeta | null = null;
	hydrated = false;

	constructor(private readonly storage: StorageBackend) {}

	async init(): Promise<void> {
		const meta = await this.storage.get<SessionMeta>(SESSION_STORE, META_KEY);
		if (meta && meta.activeSessionId) {
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
					? (oldSession.messages as ChatMessage[])
					: [],
				trace: Array.isArray(oldSession.trace)
					? (oldSession.trace as AgentTraceEntry[])
					: [],
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

			const oldHistory = await this.storage.get<{
				id: string;
				timestamp: number;
				messages: Array<{ role: "user" | "assistant"; content: string }>;
			}>(HISTORY_STORE, OLD_HISTORY_KEY);
			if (oldHistory) {
				await this.storage.set(
					HISTORY_STORE,
					`${SESSION_PREFIX}${newId}`,
					oldHistory,
				);
			}

			this.meta = { activeSessionId: newId };
			await this.storage.set(SESSION_STORE, META_KEY, this.meta);
			await this.storage.remove(SESSION_STORE, OLD_SESSION_KEY);
			await this.storage.remove(HISTORY_STORE, OLD_HISTORY_KEY);
		} else {
			const newId = crypto.randomUUID();
			this.meta = { activeSessionId: newId };
			await this.storage.set(SESSION_STORE, META_KEY, this.meta);
			const empty: SessionData = {
				id: newId,
				messages: [],
				trace: [],
				timestamp: Date.now(),
				messageCount: 0,
			};
			await this.storage.set(
				SESSION_STORE,
				`${SESSION_PREFIX}${newId}`,
				empty,
			);
		}
	}

	getActiveSessionId(): string | null {
		return this.meta?.activeSessionId ?? null;
	}

	async load(): Promise<{
		messages: ChatMessage[];
		trace: AgentTraceEntry[];
	} | null> {
		try {
			const activeId = this.meta?.activeSessionId;
			if (activeId) {
				const raw = await this.storage.get<SessionData>(
					SESSION_STORE,
					`${SESSION_PREFIX}${activeId}`,
				);
				if (!raw || typeof raw !== "object") return null;
				if (!Array.isArray(raw.messages) || !Array.isArray(raw.trace)) {
					return null;
				}
				return {
					messages: raw.messages as ChatMessage[],
					trace: raw.trace as AgentTraceEntry[],
				};
			}

			const raw = await this.storage.get<SessionSnapshot>(
				SESSION_STORE,
				OLD_SESSION_KEY,
			);
			if (!raw || typeof raw !== "object") return null;
			if (!Array.isArray(raw.messages) || !Array.isArray(raw.trace)) {
				return null;
			}
			return {
				messages: raw.messages as ChatMessage[],
				trace: raw.trace as AgentTraceEntry[],
			};
		} catch (err) {
			console.warn("Session load failed:", err);
			return null;
		}
	}

	private async loadForId(id: string): Promise<{ messages: ChatMessage[]; trace: AgentTraceEntry[] } | null> {
		const raw = await this.storage.get<SessionData>(SESSION_STORE, `${SESSION_PREFIX}${id}`);
		if (!raw || typeof raw !== "object") return null;
		if (!Array.isArray(raw.messages) || !Array.isArray(raw.trace)) return null;
		return {
			messages: raw.messages as ChatMessage[],
			trace: raw.trace as AgentTraceEntry[],
		};
	}

	scheduleSave(messages: ChatMessage[], trace: AgentTraceEntry[]): void {
		if (!this.hydrated) return;
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
		}
		this.saveTimer = setTimeout(() => {
			void this.save(messages, trace);
		}, 500);
	}

	cancelPendingSave(): void {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
	}

	async save(
		messages: ChatMessage[],
		trace: AgentTraceEntry[],
	): Promise<void> {
		try {
			const activeId = this.meta?.activeSessionId;
			const snapshot: SessionData = {
				id: activeId || crypto.randomUUID(),
				messages,
				trace,
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
				await this.storage.remove(
					HISTORY_STORE,
					`${SESSION_PREFIX}${activeId}`,
				);
			} else {
				await this.storage.remove(SESSION_STORE, OLD_SESSION_KEY);
				await this.storage.remove(HISTORY_STORE, OLD_HISTORY_KEY);
			}
		} catch (err) {
			console.warn("Session clear failed:", err);
		}
	}

	async saveHistory(
		messages: Array<{ role: "user" | "assistant"; content: string }>,
	): Promise<void> {
		try {
			const activeId = this.meta?.activeSessionId;
			const payload = {
				id: activeId || "current",
				timestamp: Date.now(),
				messages,
			};
			if (activeId) {
				await this.storage.set(
					HISTORY_STORE,
					`${SESSION_PREFIX}${activeId}`,
					payload,
				);
			} else {
				await this.storage.set(HISTORY_STORE, OLD_HISTORY_KEY, payload);
			}
		} catch (err) {
			console.warn("History save failed:", err);
		}
	}

	async loadHistory(): Promise<
		Array<{ role: "user" | "assistant"; content: string }> | null
	> {
		try {
			const activeId = this.meta?.activeSessionId;
			let raw: {
				id: string;
				timestamp: number;
				messages: Array<{ role: "user" | "assistant"; content: string }>;
			} | null = null;

			if (activeId) {
				raw = await this.storage.get<{
					id: string;
					timestamp: number;
					messages: Array<{
						role: "user" | "assistant";
						content: string;
					}>;
				}>(HISTORY_STORE, `${SESSION_PREFIX}${activeId}`);
			} else {
				raw = await this.storage.get<{
					id: string;
					timestamp: number;
					messages: Array<{
						role: "user" | "assistant";
						content: string;
					}>;
				}>(HISTORY_STORE, OLD_HISTORY_KEY);
			}

			if (!raw || !Array.isArray(raw.messages)) return null;
			const valid = raw.messages.filter(isValidHistoryEntry);
			return valid.length > 0 ? valid : null;
		} catch (err) {
			console.warn("History load failed:", err);
			return null;
		}
	}

	async createSession(): Promise<string> {
		const newId = crypto.randomUUID();
		const empty: SessionData = {
			id: newId,
			messages: [],
			trace: [],
			timestamp: Date.now(),
			messageCount: 0,
		};
		await this.storage.set(
			SESSION_STORE,
			`${SESSION_PREFIX}${newId}`,
			empty,
		);
		this.meta = { activeSessionId: newId };
		await this.storage.set(SESSION_STORE, META_KEY, this.meta);
		return newId;
	}

	async switchSession(
		id: string,
	): Promise<{ messages: ChatMessage[]; trace: AgentTraceEntry[] } | null> {
		const data = await this.loadForId(id);
		if (!data) return null;
		this.meta = { activeSessionId: id };
		await this.storage.set(SESSION_STORE, META_KEY, this.meta);
		return data;
	}

	async deleteSession(id: string): Promise<void> {
		await this.storage.remove(
			SESSION_STORE,
			`${SESSION_PREFIX}${id}`,
		);
		await this.storage.remove(
			HISTORY_STORE,
			`${SESSION_PREFIX}${id}`,
		);

		if (this.meta?.activeSessionId === id) {
			const remaining = await this.listSessions();
			if (remaining.length > 0) {
				this.meta = { activeSessionId: remaining[0]!.id };
			} else {
				const newId = crypto.randomUUID();
				this.meta = { activeSessionId: newId };
				const empty: SessionData = {
					id: newId,
					messages: [],
					trace: [],
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

	async listSessions(): Promise<SessionListItem[]> {
		const keys = await this.storage.getAllKeys(SESSION_STORE);
		const sessionKeys = keys.filter(
			(k) => k.startsWith(SESSION_PREFIX),
		);
		const sessions: SessionData[] = [];
		for (const key of sessionKeys) {
			const data = await this.storage.get<SessionData>(
				SESSION_STORE,
				key,
			);
			if (data && typeof data === "object" && data.id) {
				sessions.push(data);
			}
		}

		sessions.sort((a, b) => b.timestamp - a.timestamp);

		if (sessions.length > SESSION_CAP) {
			const toDelete = sessions.slice(SESSION_CAP);
			for (const s of toDelete) {
				await this.storage.remove(
					SESSION_STORE,
					`${SESSION_PREFIX}${s.id}`,
				);
				await this.storage.remove(
					HISTORY_STORE,
					`${SESSION_PREFIX}${s.id}`,
				);
			}
			sessions.length = SESSION_CAP;
		}

		return sessions.map((s) => ({
			id: s.id,
			title:
				s.customTitle ||
				s.title ||
				`Session ${s.id.slice(0, 8)}`,
			timestamp: s.timestamp,
			messageCount: s.messageCount,
		}));
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
		await this.storage.set(
			SESSION_STORE,
			`${SESSION_PREFIX}${id}`,
			data,
		);
	}
}

interface SessionSnapshot {
	messages: ChatMessage[];
	trace: AgentTraceEntry[];
	timestamp: number;
}
