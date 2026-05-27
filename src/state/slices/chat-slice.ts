import type { StoreApi } from "zustand/vanilla";
import type { ChatMessage } from "../../types/messages";
import type { BrowsergentStore } from "../store";

export interface ChatState {
	messages: ChatMessage[];
}

export interface ChatActions {
	appendUserMessage(message: ChatMessage): void;
	appendAssistantMessage(message: ChatMessage): void;
	appendSystemMessage(message: ChatMessage): void;
	appendAssistantDelta(messageId: string, delta: string): void;
	clearChat(): void;
	hydrateChat(messages: ChatMessage[]): void;
}

export interface ChatSlice {
	chat: ChatState;
	appendUserMessage(message: ChatMessage): void;
	appendAssistantMessage(message: ChatMessage): void;
	appendSystemMessage(message: ChatMessage): void;
	appendAssistantDelta(messageId: string, delta: string): void;
	clearChat(): void;
	hydrateChat(messages: ChatMessage[]): void;
}

export function createChatSlice(
	set: StoreApi<BrowsergentStore>["setState"],
	_get: StoreApi<BrowsergentStore>["getState"],
): ChatSlice {
	return {
		chat: { messages: [] },
		appendUserMessage(message) {
			set((state) => ({
				chat: { messages: [...state.chat.messages, message] },
			}));
		},
		appendAssistantMessage(message) {
			set((state) => ({
				chat: { messages: [...state.chat.messages, message] },
			}));
		},
		appendSystemMessage(message) {
			set((state) => ({
				chat: { messages: [...state.chat.messages, message] },
			}));
		},
		appendAssistantDelta(messageId, delta) {
			set((state) => {
				const idx = state.chat.messages.findIndex((m) => m.id === messageId);
				if (idx >= 0) {
					const next = [...state.chat.messages];
					const existing = next[idx];
					if (existing && existing.kind === "assistant") {
						next[idx] = { ...existing, text: existing.text + delta };
					}
					return { chat: { messages: next } };
				}
				return {
					chat: {
						messages: [
							...state.chat.messages,
							{
								kind: "assistant",
								id: messageId,
								text: delta,
								timestamp: Date.now(),
							},
						],
					},
				};
			});
		},
		clearChat() {
			set({ chat: { messages: [] } });
		},
		hydrateChat(messages) {
			set({ chat: { messages } });
		},
	};
}
