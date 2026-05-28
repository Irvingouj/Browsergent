import type { StorageBackend } from "../storage/storage-backend";
import type { AgentTraceEntry, ChatMessage } from "../types/messages";

interface SessionSnapshot {
	messages: ChatMessage[];
	trace: AgentTraceEntry[];
	timestamp: number;
}

export class SessionController {
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	hydrated = false;

	constructor(private readonly storage: StorageBackend) {}

	async load(): Promise<{
		messages: ChatMessage[];
		trace: AgentTraceEntry[];
	} | null> {
		try {
			const raw = await this.storage.get<SessionSnapshot>("sessions", "current");
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
			await this.storage.set("sessions", "current", snapshot);
		} catch (err) {
			console.warn("Session save failed:", err);
		}
	}

	async clear(): Promise<void> {
		try {
			await this.storage.remove("sessions", "current");
			await this.storage.remove("history", "current");
		} catch (err) {
			console.warn("Session clear failed:", err);
		}
	}

	async saveHistory(
		messages: Array<{ role: "user" | "assistant"; content: string }>,
	): Promise<void> {
		try {
			await this.storage.set("history", "current", {
				id: "current",
				timestamp: Date.now(),
				messages,
			});
		} catch (err) {
			console.warn("History save failed:", err);
		}
	}

	async loadHistory(): Promise<Array<{
		role: "user" | "assistant";
		content: string;
	}> | null> {
		try {
			const raw = await this.storage.get<{
				id: string;
				timestamp: number;
				messages: Array<{ role: "user" | "assistant"; content: string }>;
			}>("history", "current");
			if (!raw || !Array.isArray(raw.messages)) return null;
			const valid = raw.messages.filter(
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
