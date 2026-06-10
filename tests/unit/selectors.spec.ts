import { describe, expect, test } from "vitest";
import {
	selectActiveSessionId,
	selectActiveTab,
	selectAgentActiveRunId,
	selectAgentStatus,
	selectAgentStatusReason,
	selectApiKey,
	selectBaseUrl,
	selectExtjsStatus,
	selectMessageIds,
	selectMessagesById,
	selectModel,
	selectSessionPanelOpen,
	selectSessions,
	selectSettingsOpen,
	selectTaskDraft,
	selectTraceEntries,
} from "../../src/state/selectors";

describe("selectors", () => {
	const mockStore = {
		chat: {
			messageIds: ["u1", "a1"],
			messagesById: {
				u1: { kind: "user", id: "u1", text: "hi", timestamp: 1 },
			},
		},
		trace: {
			entries: [
				{
					id: "t1",
					step: 1,
					status: "done" as const,
					toolName: "run_js",
					timestamp: 1,
				},
			],
		},
		agent: {
			status: "running" as const,
			statusReason: "thinking",
			activeRunId: "run-1",
		},
		ui: {
			taskDraft: "fill",
			activeTab: "chat" as const,
			settingsOpen: false,
		},
		settings: {
			anthropicApiKey: "sk-test",
			baseUrl: "https://api.example.com",
			model: "claude-test",
		},
		session: {
			sessionPanelOpen: true,
			sessions: [{ id: "s1", title: "Test" }],
			activeSessionId: "s1",
		},
		extjs: { status: "ready" as const, output: "" },
	};

	test("selectMessageIds returns messageIds", () => {
		expect(selectMessageIds(mockStore as any)).toEqual(["u1", "a1"]);
	});

	test("selectMessagesById returns messagesById", () => {
		expect(selectMessagesById(mockStore as any)).toEqual(
			mockStore.chat.messagesById,
		);
	});

	test("selectTraceEntries returns trace entries", () => {
		expect(selectTraceEntries(mockStore as any)).toEqual(
			mockStore.trace.entries,
		);
	});

	test("selectAgentStatus returns agent status", () => {
		expect(selectAgentStatus(mockStore as any)).toBe("running");
	});

	test("selectAgentStatusReason returns reason", () => {
		expect(selectAgentStatusReason(mockStore as any)).toBe("thinking");
	});

	test("selectAgentActiveRunId returns runId", () => {
		expect(selectAgentActiveRunId(mockStore as any)).toBe("run-1");
	});

	test("selectTaskDraft returns draft", () => {
		expect(selectTaskDraft(mockStore as any)).toBe("fill");
	});

	test("selectActiveTab returns tab", () => {
		expect(selectActiveTab(mockStore as any)).toBe("chat");
	});

	test("selectApiKey returns key", () => {
		expect(selectApiKey(mockStore as any)).toBe("sk-test");
	});

	test("selectBaseUrl returns url", () => {
		expect(selectBaseUrl(mockStore as any)).toBe("https://api.example.com");
	});

	test("selectModel returns model", () => {
		expect(selectModel(mockStore as any)).toBe("claude-test");
	});

	test("selectSettingsOpen returns settingsOpen", () => {
		expect(selectSettingsOpen(mockStore as any)).toBe(false);
	});

	test("selectSessionPanelOpen returns panel state", () => {
		expect(selectSessionPanelOpen(mockStore as any)).toBe(true);
	});

	test("selectSessions returns sessions", () => {
		expect(selectSessions(mockStore as any)).toEqual([
			{ id: "s1", title: "Test" },
		]);
	});

	test("selectActiveSessionId returns active session id", () => {
		expect(selectActiveSessionId(mockStore as any)).toBe("s1");
	});

	test("selectExtjsStatus returns extjs status", () => {
		expect(selectExtjsStatus(mockStore as any)).toBe("ready");
	});
});
