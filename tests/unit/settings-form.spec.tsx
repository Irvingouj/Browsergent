import { render } from "preact-render-to-string";
import { describe, expect, test, vi } from "vitest";
import { SettingsPanel } from "../../src/sidepanel/components/SettingsPanel";

const mockState = {
	settings: {
		providers: [
			{
				id: "p1",
				name: "Anthropic",
				kind: "anthropic",
				baseUrl: "https://api.anthropic.com",
				apiKey: "sk-test-key",
				model: "claude-test",
			},
		],
		activeProviderId: "p1",
		loaded: true,
	},
	ui: {
		taskDraft: "",
		activeTab: "settings" as const,
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

// Stub the store's getState mutation helpers so the component doesn't blow up
// on add/edit/activate during render-only assertions.
vi.mock("../../src/state/store", () => ({
	browsergentStore: {
		getState: () => ({
			providersChanged: () => {},
			activeProviderChanged: () => {},
		}),
	},
}));

describe("SettingsPanel", () => {
	test("renders the active provider name and model", () => {
		const html = render(
			<SettingsPanel
				settingsController={null}
				onExportConversation={() => {}}
			/>,
		);
		expect(html).toContain("Anthropic");
		expect(html).toContain("claude-test");
	});

	test("renders add-provider buttons", () => {
		const html = render(
			<SettingsPanel
				settingsController={null}
				onExportConversation={() => {}}
			/>,
		);
		expect(html).toContain("Anthropic");
		expect(html).toContain("OpenAI-compatible");
	});

	test("marks the active provider", () => {
		const html = render(
			<SettingsPanel
				settingsController={null}
				onExportConversation={() => {}}
			/>,
		);
		expect(html).toContain("active");
	});
});
