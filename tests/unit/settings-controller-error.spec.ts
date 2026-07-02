import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { SettingsController } from "../../src/controllers/settings-controller";
import type { ProviderConfig } from "../../src/state/slices/settings-slice";
import { browsergentStore } from "../../src/state/store";
import type { StorageBackend } from "../../src/storage/storage-backend";

/** StorageBackend whose `set` always rejects — simulates chrome.storage failure. */
class RejectingStorage implements StorageBackend {
	async get(): Promise<null> {
		return null;
	}
	async set(): Promise<void> {
		throw new Error("storage write denied");
	}
	async remove(): Promise<void> {}
	async getAll<T>(): Promise<T[]> {
		return [];
	}
	async getAllKeys(): Promise<string[]> {
		return [];
	}
	async clear(): Promise<void> {}
	async close(): Promise<void> {}
}

function anthropicConfig(): ProviderConfig {
	return {
		id: "p1",
		name: "Anthropic",
		providerId: "anthropic",
		wireFormat: "anthropic-messages",
		chatEndpointUrl: "https://api.anthropic.com/v1/messages",
		modelsEndpointUrl: "https://api.anthropic.com/v1/models",
		apiKey: "sk-test",
		defaultModelId: "m1",
		models: [
			{
				id: "m1",
				name: "claude-sonnet-4-6",
				model: "claude-sonnet-4-6",
				tokenLimitParam: "max_tokens",
			},
		],
	};
}

describe("SettingsController error surfacing", () => {
	beforeEach(() => {
		browsergentStore.getState().settingsLoaded({
			providers: [],
			activeProviderId: null,
			loaded: true,
		});
	});

	afterEach(() => {
		browsergentStore.getState().settingsLoaded({
			providers: [],
			activeProviderId: null,
			loaded: true,
		});
	});

	test("save() failure lands E_SETTINGS_PERSIST in store", async () => {
		const controller = new SettingsController(new RejectingStorage());
		await controller.save({
			providers: [anthropicConfig()],
			activeProviderId: "p1",
		});
		const error = browsergentStore.getState().settings.error;
		expect(error?.code).toBe("E_SETTINGS_PERSIST");
		expect(error?.message).toContain("storage write denied");
		expect(error?.source).toBe("settings");
		expect(error?.details?.operation).toBe("save");
	});

	test("settingsErrorDismissed clears the error", () => {
		browsergentStore.getState().settingsSaveFailed({
			code: "E_SETTINGS_PERSIST",
			message: "boom",
			source: "settings",
		});
		expect(browsergentStore.getState().settings.error?.code).toBe(
			"E_SETTINGS_PERSIST",
		);
		browsergentStore.getState().settingsErrorDismissed();
		expect(browsergentStore.getState().settings.error).toBeUndefined();
	});

	test("providersChanged clears the error (editing the form resets it)", () => {
		browsergentStore.getState().settingsSaveFailed({
			code: "E_SETTINGS_PERSIST",
			message: "boom",
			source: "settings",
		});
		expect(browsergentStore.getState().settings.error).toBeDefined();
		browsergentStore.getState().providersChanged([]);
		expect(browsergentStore.getState().settings.error).toBeUndefined();
	});
});
