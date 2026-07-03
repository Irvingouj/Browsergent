import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { SettingsController } from "../../src/controllers/settings-controller";
import type { ProviderConfig } from "../../src/state/slices/settings-slice";
import { browsergentStore } from "../../src/state/store";
import { IndexedDBStorage } from "../../src/storage/indexeddb-storage";

import "fake-indexeddb/auto";

function anthropicConfig(
	overrides: Partial<ProviderConfig> = {},
): ProviderConfig {
	return {
		id: "p1",
		name: "Anthropic",
		providerId: "anthropic",
		wireFormat: "anthropic-messages",
		chatEndpointUrl: "https://api.anthropic.com/v1/messages",
		modelsEndpointUrl: "https://api.anthropic.com/v1/models",
		apiKey: "",
		defaultModelId: "m1",
		models: [
			{
				id: "m1",
				name: "claude-sonnet-4-6",
				model: "claude-sonnet-4-6",
			},
		],
		...overrides,
	};
}

describe("SettingsController with IndexedDB", () => {
	let storage: IndexedDBStorage;
	let controller: SettingsController;

	beforeEach(async () => {
		storage = new IndexedDBStorage();
		await storage.init();
		controller = new SettingsController(storage);
		browsergentStore.getState().settingsLoaded({
			providers: [],
			activeProviderId: null,
			loaded: false,
		});
	});

	afterEach(async () => {
		await storage.clear();
		await storage.close();
		browsergentStore.getState().settingsLoaded({
			providers: [],
			activeProviderId: null,
			loaded: false,
		});
	});

	test("load() hydrates store with saved providers", async () => {
		const saved: ProviderConfig[] = [
			anthropicConfig({ id: "p1", apiKey: "sk-test-key" }),
		];
		await storage.set("settings", "providers", saved);
		await storage.set("settings", "activeProviderId", "p1");

		await controller.load();

		const state = browsergentStore.getState().settings;
		expect(state.providers).toEqual(saved);
		expect(state.activeProviderId).toBe("p1");
		expect(state.loaded).toBe(true);
	});

	test("load() falls back to empty providers when none saved", async () => {
		await controller.load();

		const state = browsergentStore.getState().settings;
		expect(state.providers).toEqual([]);
		expect(state.activeProviderId).toBeNull();
		expect(state.loaded).toBe(true);
	});

	test("load() skips stale pre-refactor providers that fail validation", async () => {
		const stale = [
			{
				id: "p1",
				name: "Old",
				kind: "anthropic",
				apiKey: "sk-old",
				baseUrl: "https://api.anthropic.com",
				model: "claude-3",
			},
		];
		await storage.set("settings", "providers", stale);

		await controller.load();

		const state = browsergentStore.getState().settings;
		expect(state.providers).toHaveLength(0);
	});

	test("save() persists providers and active id", async () => {
		const providers = [anthropicConfig({ id: "p1", apiKey: "sk-new-key" })];
		await controller.save({ providers, activeProviderId: "p1" });

		expect(await storage.get("settings", "providers")).toEqual(providers);
		expect(await storage.get("settings", "activeProviderId")).toBe("p1");

		const state = browsergentStore.getState().settings;
		expect(state.providers).toEqual(providers);
		expect(state.loaded).toBe(true);
	});

	test("save() stores the full providers array (not primitives)", async () => {
		const providers = [
			anthropicConfig({ id: "p1", apiKey: "sk-primitive" }),
			{
				id: "p2",
				name: "OpenAI",
				providerId: "openai",
				wireFormat: "openai-chat-completions",
				chatEndpointUrl: "https://api.openai.com/v1/chat/completions",
				modelsEndpointUrl: "https://api.openai.com/v1/models",
				apiKey: "sk-oai",
				defaultModelId: "m2",
				models: [
					{
						id: "m2",
						name: "gpt-4o",
						model: "gpt-4o",
					},
				],
			},
		];
		await controller.save({ providers, activeProviderId: "p2" });

		const stored = await storage.get<ProviderConfig[]>("settings", "providers");
		expect(stored).toHaveLength(2);
		expect(stored?.[1]?.providerId).toBe("openai");
	});
});

test("load() drops stale providers with a pre-refactor shape", async () => {
	const storage2 = new IndexedDBStorage();
	await storage2.init();
	const controller2 = new SettingsController(storage2);
	browsergentStore.getState().settingsLoaded({
		providers: [],
		activeProviderId: null,
		loaded: false,
	});
	// Stale shape from an older schema: kind/baseUrl/model, no providerId/wireFormat.
	await storage2.set("settings", "providers", [
		{ id: "stale", name: "Old", kind: "anthropic", baseUrl: "x", apiKey: "k", model: "m" },
		anthropicConfig({ id: "good", apiKey: "sk-good" }),
	]);
	await storage2.set("settings", "activeProviderId", "stale");

	await controller2.load();

	const state = browsergentStore.getState().settings;
	expect(state.providers.map((p) => p.id)).toEqual(["good"]);
	expect(state.activeProviderId).toBeNull();
	await storage2.clear();
	await storage2.close();
});
