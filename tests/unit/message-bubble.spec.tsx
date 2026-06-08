import { render } from "preact-render-to-string";
import { describe, expect, test, vi } from "vitest";
import { MessageBubble } from "../../src/sidepanel/components/MessageBubble";
import type { ChatMessage } from "../../src/types/messages";

const mockMessages: Record<string, ChatMessage> = {
	mu1: { kind: "user", id: "mu1", text: "Hello user", timestamp: 0 },
	ma1: { kind: "assistant", id: "ma1", text: "Hello assistant", timestamp: 0 },
	ms1: { kind: "system", id: "ms1", text: "System alert", timestamp: 0 },
};

const mockState = {
	chat: { messagesById: mockMessages },
	ui: {
		taskDraft: "",
		activeTab: "chat" as const,
		jsCodeDraft: "",
		settingsOpen: false,
	},
	agent: { status: "idle" as const },
	trace: { entries: [], entriesById: {} },
	extjs: { status: "uninitialized" as const, output: "" },
	session: { sessions: [], activeSessionId: null, sessionPanelOpen: false },
	settings: {
		anthropicApiKey: "",
		baseUrl: "",
		model: "",
		loaded: false,
	},
};

vi.mock("zustand/react", () => ({
	useStore: (_store: unknown, selector: (state: unknown) => unknown) => {
		return selector(mockState);
	},
}));

describe("MessageBubble", () => {
	test("renders user message with correct role", () => {
		const html = render(<MessageBubble messageId="mu1" />);
		expect(html).toContain("Hello user");
		expect(html).toContain("chat-message-user");
		expect(html).toContain("msg-label--user");
	});

	test("renders assistant message with correct role", () => {
		const html = render(<MessageBubble messageId="ma1" />);
		expect(html).toContain("Hello assistant");
		expect(html).toContain("chat-message-assistant");
		expect(html).toContain("msg-label--assistant");
	});

	test("renders system message with correct role", () => {
		const html = render(<MessageBubble messageId="ms1" />);
		expect(html).toContain("System alert");
		expect(html).toContain("chat-message-system");
		expect(html).toContain("msg-label--system");
	});

	test("returns null for unknown message id", () => {
		const html = render(<MessageBubble messageId="unknown" />);
		expect(html).toBe("");
	});
});
