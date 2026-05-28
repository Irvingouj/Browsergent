import { describe, expect, test } from "vitest";
import { browsergentStore } from "../../src/state/store";

describe("settings slice", () => {
	test("settingsSaveFailed restores loaded to true after a failed save", () => {
		// Start with a loaded state
		browsergentStore.getState().settingsLoaded({
			anthropicApiKey: "",
			baseUrl: "https://api.anthropic.com",
			model: "claude-sonnet-4-20250514",
			loaded: true,
		});

		// Begin a save
		browsergentStore.getState().settingsSaveStarted();
		expect(browsergentStore.getState().settings.loaded).toBe(false);

		// Save fails
		browsergentStore.getState().settingsSaveFailed({
			code: "E_UNKNOWN",
			message: "network error",
		});

		// loaded should be restored to true so the UI isn't stuck in loading
		expect(browsergentStore.getState().settings.loaded).toBe(true);
	});
});
