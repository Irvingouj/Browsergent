import type {
	AgentHistoryContentBlock,
	AgentHistoryEntry,
	AgentHistoryMessage,
	AgentHistoryStopReason,
} from "@pi-oxide/pi-host-web";
import type { ChatMessage } from "./messages";

export interface SessionTranscriptEntry extends AgentHistoryEntry {
	parentId: string | null;
	displayText: string | null;
}

export interface SessionTranscript {
	version: 1;
	entries: Record<string, SessionTranscriptEntry>;
	leafId: string | null;
}

export type NewSessionTranscriptEntry = Omit<
	SessionTranscriptEntry,
	"parentId"
> & { parentId: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isContentBlock(value: unknown): value is AgentHistoryContentBlock {
	if (!isRecord(value) || typeof value.type !== "string") return false;
	switch (value.type) {
		case "text":
			return typeof value.text === "string";
		case "tool_call":
			// Tool arguments are opaque provider data; the pi-host boundary validates them.
			return (
				typeof value.id === "string" &&
				typeof value.name === "string" &&
				"arguments" in value
			);
		case "image":
			return (
				typeof value.mimeType === "string" && typeof value.data === "string"
			);
		default:
			return false;
	}
}

function isHistoryStopReason(value: unknown): value is AgentHistoryStopReason {
	return (
		value === "end_turn" ||
		value === "max_tokens" ||
		value === "tool_use" ||
		value === "aborted" ||
		value === "error"
	);
}

function isUsage(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return (
		isFiniteNumber(value.input) &&
		isFiniteNumber(value.output) &&
		isFiniteNumber(value.cache_read) &&
		isFiniteNumber(value.cache_write) &&
		isFiniteNumber(value.total_tokens)
	);
}

export function isAgentHistoryMessage(
	value: unknown,
): value is AgentHistoryMessage {
	if (!isRecord(value) || !Array.isArray(value.content)) return false;
	if (
		!value.content.every(isContentBlock) ||
		!isFiniteNumber(value.timestamp)
	) {
		return false;
	}

	switch (value.role) {
		case "user":
			return true;
		case "assistant":
			return (
				typeof value.api === "string" &&
				typeof value.provider === "string" &&
				typeof value.model === "string" &&
				isHistoryStopReason(value.stopReason) &&
				(value.errorMessage === undefined ||
					typeof value.errorMessage === "string") &&
				isUsage(value.usage)
			);
		case "tool_result":
			return (
				typeof value.tool_call_id === "string" &&
				typeof value.tool_name === "string" &&
				(value.details === undefined || isRecord(value.details)) &&
				typeof value.is_error === "boolean"
			);
		default:
			return false;
	}
}

export function isAgentHistoryEntry(
	value: unknown,
): value is AgentHistoryEntry {
	if (!isRecord(value)) return false;
	return (
		typeof value.entryId === "string" &&
		value.entryId.length > 0 &&
		isFiniteNumber(value.turnNumber) &&
		Number.isInteger(value.turnNumber) &&
		value.turnNumber >= 0 &&
		isAgentHistoryMessage(value.message)
	);
}

export function isSessionTranscriptEntry(
	value: unknown,
): value is SessionTranscriptEntry {
	if (!isRecord(value)) return false;
	return (
		typeof value.entryId === "string" &&
		value.entryId.length > 0 &&
		(value.parentId === null ||
			(typeof value.parentId === "string" && value.parentId.length > 0)) &&
		isFiniteNumber(value.turnNumber) &&
		Number.isInteger(value.turnNumber) &&
		value.turnNumber >= 0 &&
		(value.displayText === null || typeof value.displayText === "string") &&
		isAgentHistoryMessage(value.message)
	);
}

export function isSessionTranscript(
	value: unknown,
): value is SessionTranscript {
	if (!isRecord(value) || value.version !== 1 || !isRecord(value.entries)) {
		return false;
	}
	const entries: Record<string, SessionTranscriptEntry> = {};
	for (const [id, entry] of Object.entries(value.entries)) {
		if (!isSessionTranscriptEntry(entry) || entry.entryId !== id) return false;
		entries[id] = entry;
	}
	if (
		value.leafId !== null &&
		(typeof value.leafId !== "string" || !(value.leafId in entries))
	) {
		return false;
	}

	for (const id of Object.keys(entries)) {
		const visited = new Set<string>();
		let cursor: string | null = id;
		while (cursor !== null) {
			if (visited.has(cursor)) return false;
			visited.add(cursor);
			const entry: SessionTranscriptEntry | undefined = entries[cursor];
			if (!entry) return false;
			cursor = entry.parentId;
			if (cursor !== null && !(cursor in entries)) return false;
		}
	}
	return true;
}

export function emptySessionTranscript(): SessionTranscript {
	return { version: 1, entries: {}, leafId: null };
}

export function transcriptPath(
	transcript: SessionTranscript,
): SessionTranscriptEntry[] {
	const reversePath: SessionTranscriptEntry[] = [];
	const visited = new Set<string>();
	let cursor = transcript.leafId;
	while (cursor !== null) {
		if (visited.has(cursor)) {
			throw new Error(`Cycle in session transcript at entry ${cursor}`);
		}
		visited.add(cursor);
		const entry = transcript.entries[cursor];
		if (!entry) {
			throw new Error(`Missing session transcript entry ${cursor}`);
		}
		reversePath.push(entry);
		cursor = entry.parentId;
	}
	return reversePath.reverse();
}

export function transcriptHistory(
	transcript: SessionTranscript,
): AgentHistoryEntry[] {
	return transcriptPath(transcript).map(({ entryId, turnNumber, message }) => ({
		entryId,
		turnNumber,
		message,
	}));
}

export function appendTranscriptEntry(
	transcript: SessionTranscript,
	entry: NewSessionTranscriptEntry,
): SessionTranscript {
	if (entry.parentId !== transcript.leafId) {
		throw new Error(
			`Transcript parent mismatch: expected ${transcript.leafId ?? "root"}, got ${entry.parentId ?? "root"}`,
		);
	}
	if (entry.entryId in transcript.entries) {
		throw new Error(`Duplicate session transcript entry ${entry.entryId}`);
	}
	const nextEntry: SessionTranscriptEntry = { ...entry };
	return {
		version: 1,
		entries: { ...transcript.entries, [entry.entryId]: nextEntry },
		leafId: entry.entryId,
	};
}

export function selectTranscriptLeaf(
	transcript: SessionTranscript,
	leafId: string | null,
): SessionTranscript {
	if (leafId !== null && !(leafId in transcript.entries)) {
		throw new Error(`Unknown session transcript leaf ${leafId}`);
	}
	return { ...transcript, leafId };
}

export function projectTranscript(
	transcript: SessionTranscript,
): ChatMessage[] {
	const messages: ChatMessage[] = [];
	for (const entry of transcriptPath(transcript)) {
		const text = entry.displayText;
		if (text === null || !text) continue;
		if (entry.message.role === "user") {
			messages.push({
				kind: "user",
				id: entry.entryId,
				text,
				timestamp: entry.message.timestamp,
			});
		} else if (entry.message.role === "assistant") {
			messages.push({
				kind: "assistant",
				id: entry.entryId,
				text,
				timestamp: entry.message.timestamp,
			});
		}
	}
	return messages;
}
