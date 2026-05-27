import type { AgentTraceEntry, ChatMessage } from "../types/messages";

interface SessionSnapshot {
	messages: ChatMessage[];
	trace: AgentTraceEntry[];
	timestamp: number;
}

const STORAGE_KEY = "browsergentSession";
const HISTORY_KEY = "browsergentConversationHistory";

export class SessionController {
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	hydrated = false;

	async load(): Promise<{
		messages: ChatMessage[];
		trace: AgentTraceEntry[];
	} | null> {
		try {
			const result = await chrome.storage.local.get([STORAGE_KEY]);
			const snapshot = result[STORAGE_KEY] as SessionSnapshot | undefined;
			if (!snapshot) return null;
			return { messages: snapshot.messages, trace: snapshot.trace };
		} catch (err) {
			console.warn("Session load failed:", err);
			return null;
		}
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

	async save(messages: ChatMessage[], trace: AgentTraceEntry[]): Promise<void> {
		try {
			const snapshot: SessionSnapshot = {
				messages,
				trace,
				timestamp: Date.now(),
			};
			await chrome.storage.local.set({ [STORAGE_KEY]: snapshot });
		} catch (err) {
			console.warn("Session save failed:", err);
		}
	}

	async clear(): Promise<void> {
		try {
			await chrome.storage.local.remove(STORAGE_KEY);
			await chrome.storage.local.remove(HISTORY_KEY);
		} catch (err) {
			console.warn("Session clear failed:", err);
		}
	}

	async saveHistory(
		messages: Array<{ role: "user" | "assistant"; content: string }>,
	): Promise<void> {
		try {
			await chrome.storage.local.set({ [HISTORY_KEY]: messages });
		} catch (err) {
			console.warn("History save failed:", err);
		}
	}

	async loadHistory(): Promise<Array<{
		role: "user" | "assistant";
		content: string;
	}> | null> {
		try {
			const result = await chrome.storage.local.get([HISTORY_KEY]);
			const raw = result[HISTORY_KEY];
			if (!Array.isArray(raw)) return null;
			const valid = raw.filter(
				(m): m is { role: "user" | "assistant"; content: string } =>
					m !== null &&
					typeof m === "object" &&
					(m.role === "user" || m.role === "assistant") &&
					typeof m.content === "string",
			);
			return valid.length > 0 ? valid : null;
		} catch (err) {
			console.warn("History load failed:", err);
			return null;
		}
	}
}
