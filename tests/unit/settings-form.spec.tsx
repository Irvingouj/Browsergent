import { describe, expect, test, vi } from "vitest";
import { render } from "preact-render-to-string";
import { SettingsForm } from "../../src/sidepanel/components/SettingsForm";

const mockState = {
	settings: {
		anthropicApiKey: "sk-test-key",
		baseUrl: "https://api.example.com",
		model: "claude-test",
	},
	ui: {
		taskDraft: "",
		activeTab: "chat" as const,
		jsCodeDraft: "",
		settingsOpen: false,
	},
	agent: { status: "idle" as const },
	chat: { messageIds: [], messagesById: {} },
	trace: { entries: [], entriesById: {} },
	extjs: { status: "uninitialized" as const, output: "" },
	session: { sessions: [], activeSessionId: null, sessionPanelOpen: false },
};

vi.mock("zustand/react", () => ({
	useStore: (_store: unknown, selector: (state: unknown) => unknown) => {
		return selector(mockState);
	},
}));

describe("SettingsForm", () => {
	test("renders API key and model values", () => {
		const html = render(
			<SettingsForm onSave={() => {}} onExport={() => {}} />,
		);
		expect(html).toContain("sk-test-key");
		expect(html).toContain("https://api.example.com");
		expect(html).toContain("claude-test");
	});

	test("has Save and Export buttons", () => {
		const html = render(
			<SettingsForm onSave={() => {}} onExport={() => {}} />,
		);
		expect(html).toContain("Save");
		expect(html).toContain("Export conversation");
	});

	test("renders three inputs", () => {
		const html = render(
			<SettingsForm onSave={() => {}} onExport={() => {}} />,
		);
		const matches = html.match(/<input/g);
		expect(matches).toHaveLength(3);
	});
});
