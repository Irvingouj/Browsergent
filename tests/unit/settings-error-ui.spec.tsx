import { render } from "preact-render-to-string";
import { describe, expect, test, vi } from "vitest";
import type { BrowsergentError } from "../../src/errors/browsergent-error";
import { SettingsPanel } from "../../src/sidepanel/components/SettingsPanel";

const dismissed = vi.fn();
const storeStub = {
	providersChanged: () => {},
	activeProviderChanged: () => {},
	settingsErrorDismissed: dismissed,
};

let mockError: BrowsergentError | undefined;

vi.mock("zustand/react", () => ({
	useStore: (_store: unknown, selector: (state: unknown) => unknown) =>
		selector({
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
				error: mockError,
			},
			ui: { taskDraft: "", activeTab: "settings", settingsOpen: false },
			agent: { status: "idle" },
			chat: { messageIds: [], messagesById: {} },
			trace: { entries: [], entriesById: {} },
			extjs: { status: "uninitialized", output: "" },
			session: {
				sessions: [],
				activeSessionId: null,
				sessionPanelOpen: false,
			},
		}),
}));

vi.mock("../../src/state/store", () => ({
	browsergentStore: { getState: () => storeStub },
}));

function renderPanel(): string {
	return render(
		<SettingsPanel settingsController={null} onExportConversation={() => {}} />,
	);
}

describe("SettingsPanel error banner", () => {
	test("renders the error message when settings.error is set", () => {
		mockError = {
			code: "E_SETTINGS_PERSIST",
			message: "存储写入被拒绝",
			source: "settings",
		};
		const html = renderPanel();
		expect(html).toContain('data-testid="settings-error"');
		expect(html).toContain("存储写入被拒绝");
	});

	test("does not render the banner when there is no error", () => {
		mockError = undefined;
		const html = renderPanel();
		expect(html).not.toContain('data-testid="settings-error"');
	});

	test("dismiss control is present when error is set", () => {
		mockError = {
			code: "E_SETTINGS_PERSIST",
			message: "boom",
			source: "settings",
		};
		const html = renderPanel();
		expect(html).toContain("×");
		// render-to-string doesn't fire events; dismissal wiring is covered by
		// settings-controller-error.spec.ts + the settingsErrorDismissed slice test.
	});
});
