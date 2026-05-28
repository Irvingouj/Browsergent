import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { SettingsController } from "../../src/controllers/settings-controller";
import { IndexedDBStorage } from "../../src/storage/indexeddb-storage";
import { browsergentStore } from "../../src/state/store";

import "fake-indexeddb/auto";

describe("SettingsController with IndexedDB", () => {
	let storage: IndexedDBStorage;
	let controller: SettingsController;

	beforeEach(async () => {
		storage = new IndexedDBStorage();
		await storage.init();
		controller = new SettingsController(storage);
		browsergentStore.getState().settingsLoaded({
			anthropicApiKey: "",
			baseUrl: "https://api.anthropic.com",
			model: "claude-sonnet-4-6",
			loaded: false,
		});
	});

	afterEach(async () => {
		await storage.clear();
		await storage.close();
		browsergentStore.getState().settingsLoaded({
			anthropicApiKey: "",
			baseUrl: "https://api.anthropic.com",
			model: "claude-sonnet-4-6",
			loaded: false,
		});
	});

	test("load() hydrates store with saved settings", async () => {
		await storage.set("settings", "apiKey", "sk-test-key");
		await storage.set("settings", "baseUrl", "https://custom.example.com");
		await storage.set("settings", "model", "claude-test");

		await controller.load();

		const state = browsergentStore.getState().settings;
		expect(state.anthropicApiKey).toBe("sk-test-key");
		expect(state.baseUrl).toBe("https://custom.example.com");
		expect(state.model).toBe("claude-test");
		expect(state.loaded).toBe(true);
	});

	test("load() falls back to defaults when empty", async () => {
		await controller.load();

		const state = browsergentStore.getState().settings;
		expect(state.anthropicApiKey).toBe("");
		expect(state.baseUrl).toBe("https://api.anthropic.com");
		expect(state.model).toBe("claude-sonnet-4-6");
		expect(state.loaded).toBe(true);
	});

	test("save() persists settings", async () => {
		await controller.save({
			anthropicApiKey: "sk-new-key",
			baseUrl: "https://new.example.com",
			model: "claude-new",
		});

		expect(await storage.get("settings", "apiKey")).toBe("sk-new-key");
		expect(await storage.get("settings", "baseUrl")).toBe("https://new.example.com");
		expect(await storage.get("settings", "model")).toBe("claude-new");

		const state = browsergentStore.getState().settings;
		expect(state.anthropicApiKey).toBe("sk-new-key");
		expect(state.loaded).toBe(true);
	});

	test("save() stores primitive values correctly", async () => {
		await controller.save({
			anthropicApiKey: "sk-primitive",
			baseUrl: "",
			model: "",
		});

		const apiKey = await storage.get("settings", "apiKey");
		expect(apiKey).toBe("sk-primitive");
	});
});
