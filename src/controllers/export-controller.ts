import pkg from "../../package.json";
import type {
	AgentDiagnosticEvent,
	AgentTraceEntry,
	ChatMessage,
} from "../types/messages";

export interface ConversationExport {
	exportedAt: string;
	packages: {
		browsergent: string;
		"pi-host-web": string;
		"extension-js": string;
	};
	messages: ChatMessage[];
	trace: AgentTraceEntry[];
	diagnostics: AgentDiagnosticEvent[];
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

export function buildExportSnapshot(
	messages: ChatMessage[],
	trace: AgentTraceEntry[],
	diagnostics: AgentDiagnosticEvent[],
): ConversationExport {
	return {
		exportedAt: new Date().toISOString(),
		packages: {
			browsergent: pkg.version,
			"pi-host-web": pkg.dependencies["@pi-oxide/pi-host-web"] ?? "unknown",
			"extension-js": pkg.dependencies["@pi-oxide/extension-js"] ?? "unknown",
		},
		messages,
		trace,
		diagnostics,
	};
}
