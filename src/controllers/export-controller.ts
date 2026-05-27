import type { AgentTraceEntry, ChatMessage } from "../types/messages";

export interface ConversationExport {
	exportedAt: string;
	messages: ChatMessage[];
	trace: AgentTraceEntry[];
}

export function exportConversation(snapshot: ConversationExport): void {
	const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `browsergent-conversation-${Date.now()}.json`;
	a.click();
	URL.revokeObjectURL(url);
}
