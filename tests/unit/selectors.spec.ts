import { describe, expect, test } from "vitest";
import {
	selectActiveSessionId,
	selectActiveTab,
	selectAgentActiveRunId,
	selectAgentStatus,
	selectAgentStatusReason,
	selectApiKey,
	selectBaseUrl,
	selectExpandedFolderIds,
	selectExtjsStatus,
	selectMessageIds,
	selectMessagesById,
	selectModel,
	selectRetryState,
	selectSessionPanelOpen,
	selectSessions,
	selectSettingsOpen,
	selectTaskDraft,
	selectTraceEntries,
} from "../../src/state/selectors";
import type { BrowsergentStore } from "../../src/state/store";

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
		diagnostics: {
			events: [] as unknown[],
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
		files: {
			nodes: {},
			rootIds: [],
			selectedFileId: null,
			filesVersion: 0,
			expandedFolderIds: ["/sub"],
		},
	} as unknown as BrowsergentStore;

	test("selectMessageIds returns messageIds", () => {
		expect(selectMessageIds(mockStore)).toEqual(["u1", "a1"]);
	});

	test("selectMessagesById returns messagesById", () => {
		expect(selectMessagesById(mockStore)).toEqual(mockStore.chat.messagesById);
	});

	test("selectTraceEntries returns trace entries", () => {
		expect(selectTraceEntries(mockStore)).toEqual(mockStore.trace.entries);
	});

	test("selectAgentStatus returns agent status", () => {
		expect(selectAgentStatus(mockStore)).toBe("running");
	});

	test("selectAgentStatusReason returns reason", () => {
		expect(selectAgentStatusReason(mockStore)).toBe("thinking");
	});

	test("selectAgentActiveRunId returns runId", () => {
		expect(selectAgentActiveRunId(mockStore)).toBe("run-1");
	});

	test("selectTaskDraft returns draft", () => {
		expect(selectTaskDraft(mockStore)).toBe("fill");
	});

	test("selectActiveTab returns tab", () => {
		expect(selectActiveTab(mockStore)).toBe("chat");
	});

	test("selectApiKey returns key", () => {
		expect(selectApiKey(mockStore)).toBe("sk-test");
	});

	test("selectBaseUrl returns url", () => {
		expect(selectBaseUrl(mockStore)).toBe("https://api.example.com");
	});

	test("selectModel returns model", () => {
		expect(selectModel(mockStore)).toBe("claude-test");
	});

	test("selectSettingsOpen returns settingsOpen", () => {
		expect(selectSettingsOpen(mockStore)).toBe(false);
	});

	test("selectSessionPanelOpen returns panel state", () => {
		expect(selectSessionPanelOpen(mockStore)).toBe(true);
	});

	test("selectSessions returns sessions", () => {
		expect(selectSessions(mockStore)).toEqual([{ id: "s1", title: "Test" }]);
	});

	test("selectActiveSessionId returns active session id", () => {
		expect(selectActiveSessionId(mockStore)).toBe("s1");
	});

	test("selectExtjsStatus returns extjs status", () => {
		expect(selectExtjsStatus(mockStore)).toBe("ready");
	});

	test("selectExpandedFolderIds returns expanded folder ids", () => {
		expect(selectExpandedFolderIds(mockStore)).toEqual(["/sub"]);
	});
});

describe("selectRetryState", () => {
	function makeStore(status: string, events: unknown[]): BrowsergentStore {
		return {
			chat: { messageIds: [], messagesById: {} },
			trace: { entries: [] },
			diagnostics: { events: events as never },
			agent: { status: status as never },
			ui: { taskDraft: "", activeTab: "chat", settingsOpen: false },
			settings: { anthropicApiKey: "", baseUrl: "", model: "" },
			session: { sessionPanelOpen: false, sessions: [], activeSessionId: null },
			extjs: { status: "ready", output: "" },
			files: {
				nodes: {},
				rootIds: [],
				selectedFileId: null,
				filesVersion: 0,
				expandedFolderIds: [],
			},
		} as unknown as BrowsergentStore;
	}

	const retryEvent = {
		kind: "provider_retry",
		timestamp: 1000,
		attempt: 2,
		maxAttempts: 3,
		delayMs: 2000,
		status: 429,
		error: "rate limited",
		recoverable: true,
	};

	test("returns null when diagnostics is empty", () => {
		expect(selectRetryState(makeStore("running", []))).toBeNull();
	});

	test("returns null when last event is not provider_retry", () => {
		expect(
			selectRetryState(
				makeStore("running", [{ kind: "provider_request" }]),
			),
		).toBeNull();
	});

	test("returns null when agent status is not an active run state", () => {
		expect(selectRetryState(makeStore("idle", [retryEvent]))).toBeNull();
		expect(selectRetryState(makeStore("done", [retryEvent]))).toBeNull();
		expect(selectRetryState(makeStore("stopped", [retryEvent]))).toBeNull();
		expect(selectRetryState(makeStore("error", [retryEvent]))).toBeNull();
	});

	test("returns retry state when last event is provider_retry and running", () => {
		const result = selectRetryState(makeStore("waiting_for_model", [retryEvent]));
		expect(result).toEqual({
			attempt: 2,
			maxAttempts: 3,
			delayMs: 2000,
			status: 429,
			errorLabel: "rate limit",
		});
	});

	test("normalizes 529 to 'overloaded'", () => {
		const event = { ...retryEvent, status: 529 };
		const result = selectRetryState(makeStore("running", [event]));
		expect(result?.errorLabel).toBe("overloaded");
	});

	test("falls back to 'http N' for unknown status", () => {
		const event = { ...retryEvent, status: 502 };
		const result = selectRetryState(makeStore("running", [event]));
		expect(result?.errorLabel).toBe("bad gateway");
	});

	test("falls back to 'network error' when status is undefined", () => {
		const event = { ...retryEvent, status: undefined };
		const result = selectRetryState(makeStore("running", [event]));
		expect(result?.errorLabel).toBe("network error");
	});
});
