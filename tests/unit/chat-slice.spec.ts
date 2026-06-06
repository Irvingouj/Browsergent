import { describe, expect, test } from "vitest";
import { createStore } from "zustand/vanilla";
import { createChatSlice } from "../../src/state/slices/chat-slice";
import type { BrowsergentStore } from "../../src/state/store";
import type { ChatMessage } from "../../src/types/messages";

function makeMessage(
	kind: ChatMessage["kind"],
	id: string,
	text: string,
): ChatMessage {
	return { kind, id, text, timestamp: Date.now() };
}

function createTestStore() {
	return createStore<BrowsergentStore>((set, get) => ({
		...createChatSlice(set, get),
	}));
}

describe("chat-slice (normalized)", () => {
	test("appendUserMessage adds to messageIds and messagesById", () => {
		const store = createTestStore();
		const msg = makeMessage("user", "u1", "hello");
		store.getState().appendUserMessage(msg);
		const state = store.getState();
		expect(state.chat.messageIds).toEqual(["u1"]);
		expect(state.chat.messagesById.u1).toEqual(msg);
	});

	test("appendAssistantMessage adds to both structures", () => {
		const store = createTestStore();
		const msg = makeMessage("assistant", "a1", "response");
		store.getState().appendAssistantMessage(msg);
		const state = store.getState();
		expect(state.chat.messageIds).toEqual(["a1"]);
		expect(state.chat.messagesById.a1).toEqual(msg);
	});

	test("finalizeAssistantMessage updates text for existing message", () => {
		const store = createTestStore();
		store.getState().appendAssistantMessage(makeMessage("assistant", "a1", ""));
		store.getState().finalizeAssistantMessage("a1", "final text");
		const state = store.getState();
		expect(state.chat.messageIds).toEqual(["a1"]);
		expect(state.chat.messagesById.a1.text).toBe("final text");
	});

	test("finalizeAssistantMessage creates entry for unknown messageId", () => {
		const store = createTestStore();
		store.getState().finalizeAssistantMessage("unknown", "fallback");
		const state = store.getState();
		expect(state.chat.messageIds).toContain("unknown");
		expect(state.chat.messagesById.unknown.text).toBe("fallback");
	});

	test("clearChat resets both structures", () => {
		const store = createTestStore();
		store.getState().appendUserMessage(makeMessage("user", "u1", "hi"));
		store.getState().clearChat();
		const state = store.getState();
		expect(state.chat.messageIds).toEqual([]);
		expect(state.chat.messagesById).toEqual({});
	});

	test("hydrateChat builds both structures from flat array", () => {
		const store = createTestStore();
		const msgs = [
			makeMessage("user", "u1", "hello"),
			makeMessage("assistant", "a1", "hi"),
		];
		store.getState().hydrateChat(msgs);
		const state = store.getState();
		expect(state.chat.messageIds).toEqual(["u1", "a1"]);
		expect(state.chat.messagesById.u1.text).toBe("hello");
		expect(state.chat.messagesById.a1.text).toBe("hi");
	});

	test("appendSystemMessage works like other appends", () => {
		const store = createTestStore();
		const msg = makeMessage("system", "s1", "system msg");
		store.getState().appendSystemMessage(msg);
		const state = store.getState();
		expect(state.chat.messageIds).toEqual(["s1"]);
		expect(state.chat.messagesById.s1).toEqual(msg);
	});
});
