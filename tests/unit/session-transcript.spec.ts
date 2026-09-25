import type { AgentHistoryMessage } from "@pi-oxide/pi-host-web";
import { describe, expect, test } from "vitest";
import {
	appendTranscriptEntry,
	emptySessionTranscript,
	isSessionTranscript,
	projectTranscript,
	selectTranscriptLeaf,
	transcriptHistory,
	transcriptPath,
} from "../../src/types/session-transcript";

function userMessage(text: string): AgentHistoryMessage {
	return {
		role: "user",
		content: [{ type: "text", text }],
		timestamp: 1,
	};
}

function assistantMessage(text: string): AgentHistoryMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "openai",
		provider: "test",
		model: "test-model",
		stopReason: "end_turn",
		timestamp: 2,
		usage: {
			input: 1,
			output: 1,
			cache_read: 0,
			cache_write: 0,
			total_tokens: 2,
		},
	};
}

describe("session transcript", () => {
	test("keeps prior branches and projects only the selected path", () => {
		let transcript = emptySessionTranscript();
		transcript = appendTranscriptEntry(transcript, {
			entryId: "user-1",
			parentId: null,
			turnNumber: 1,
			displayText: "Question one",
			message: userMessage("Question one"),
		});
		transcript = appendTranscriptEntry(transcript, {
			entryId: "assistant-1",
			parentId: "user-1",
			turnNumber: 1,
			displayText: "Answer one",
			message: assistantMessage("Answer one"),
		});

		transcript = selectTranscriptLeaf(transcript, "user-1");
		transcript = appendTranscriptEntry(transcript, {
			entryId: "user-2",
			parentId: "user-1",
			turnNumber: 2,
			displayText: "Question two",
			message: userMessage("Question two"),
		});
		transcript = appendTranscriptEntry(transcript, {
			entryId: "hidden-skill",
			parentId: "user-2",
			turnNumber: 2,
			displayText: null,
			message: userMessage("Internal skill context"),
		});
		transcript = appendTranscriptEntry(transcript, {
			entryId: "assistant-2",
			parentId: "hidden-skill",
			turnNumber: 2,
			displayText: "Answer two",
			message: assistantMessage("Answer two"),
		});

		expect(Object.keys(transcript.entries)).toHaveLength(5);
		expect(transcriptPath(transcript).map((entry) => entry.entryId)).toEqual([
			"user-1",
			"user-2",
			"hidden-skill",
			"assistant-2",
		]);
		expect(transcriptHistory(transcript).map((entry) => entry.entryId)).toEqual(
			["user-1", "user-2", "hidden-skill", "assistant-2"],
		);
		expect(projectTranscript(transcript)).toEqual([
			{ kind: "user", id: "user-1", text: "Question one", timestamp: 1 },
			{ kind: "user", id: "user-2", text: "Question two", timestamp: 1 },
			{
				kind: "assistant",
				id: "assistant-2",
				text: "Answer two",
				timestamp: 2,
			},
		]);
	});

	test("validates parent links and rejects cycles at the storage boundary", () => {
		let transcript = emptySessionTranscript();
		transcript = appendTranscriptEntry(transcript, {
			entryId: "root",
			parentId: null,
			turnNumber: 1,
			displayText: "Hello",
			message: userMessage("Hello"),
		});
		expect(isSessionTranscript(transcript)).toBe(true);

		const cyclic = {
			...transcript,
			entries: {
				root: { ...transcript.entries.root, parentId: "root" },
			},
		};
		expect(isSessionTranscript(cyclic)).toBe(false);
		expect(() =>
			appendTranscriptEntry(transcript, {
				entryId: "orphan",
				parentId: null,
				turnNumber: 2,
				display: true,
				message: userMessage("Wrong parent"),
			}),
		).toThrow("Transcript parent mismatch");
	});
});
