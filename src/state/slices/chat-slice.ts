import type { StoreApi } from "zustand/vanilla";
import type { ChatMessage } from "../../types/messages";
import type { BrowsergentStore } from "../store";

export interface ChatState {
	messageIds: string[];
	messagesById: Record<string, ChatMessage>;
}

export interface ChatActions {
	appendUserMessage(message: ChatMessage): void;
	appendAssistantMessage(message: ChatMessage): void;
	appendSystemMessage(message: ChatMessage): void;
	finalizeAssistantMessage(messageId: string, finalText: string): void;
	clearChat(): void;
	hydrateChat(messages: ChatMessage[]): void;
}

export function getMessages(state: { chat: ChatState }): ChatMessage[] {
	return state.chat.messageIds
		.map((id) => state.chat.messagesById[id])
		.filter((m): m is ChatMessage => !!m);
}

export interface ChatSlice {
	chat: ChatState;
	appendUserMessage(message: ChatMessage): void;
	appendAssistantMessage(message: ChatMessage): void;
	appendSystemMessage(message: ChatMessage): void;
	finalizeAssistantMessage(messageId: string, finalText: string): void;
	clearChat(): void;
	hydrateChat(messages: ChatMessage[]): void;
}

export function createChatSlice(
	set: StoreApi<BrowsergentStore>["setState"],
	_get: StoreApi<BrowsergentStore>["getState"],
): ChatSlice {
	return {
		chat: { messageIds: [], messagesById: {} },
		appendUserMessage(message) {
			set((state) => ({
				chat: {
					messageIds: [...state.chat.messageIds, message.id],
					messagesById: { ...state.chat.messagesById, [message.id]: message },
				},
			}));
		},
		appendAssistantMessage(message) {
			set((state) => ({
				chat: {
					messageIds: [...state.chat.messageIds, message.id],
					messagesById: { ...state.chat.messagesById, [message.id]: message },
				},
			}));
		},
		appendSystemMessage(message) {
			set((state) => ({
				chat: {
					messageIds: [...state.chat.messageIds, message.id],
					messagesById: { ...state.chat.messagesById, [message.id]: message },
				},
			}));
		},
		finalizeAssistantMessage(messageId, finalText) {
			set((state) => {
				const existing = state.chat.messagesById[messageId];
				if (existing && existing.kind === "assistant") {
					return {
						chat: {
							messageIds: state.chat.messageIds,
							messagesById: {
								...state.chat.messagesById,
								[messageId]: { ...existing, text: finalText },
							},
						},
					};
				}
				return {
					chat: {
						messageIds: [...state.chat.messageIds, messageId],
						messagesById: {
							...state.chat.messagesById,
							[messageId]: {
								kind: "assistant",
								id: messageId,
								text: finalText,
								timestamp: Date.now(),
							},
						},
					},
				};
			});
		},
		clearChat() {
			set({ chat: { messageIds: [], messagesById: {} } });
		},
		hydrateChat(messages) {
			const messageIds = messages.map((m) => m.id);
			const messagesById: Record<string, ChatMessage> = {};
			for (const m of messages) {
				messagesById[m.id] = m;
			}
			set({ chat: { messageIds, messagesById } });
		},
	};
}
