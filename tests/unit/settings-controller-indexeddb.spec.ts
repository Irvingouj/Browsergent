import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SettingsController } from "../../src/controllers/settings-controller";
import type { ProviderConfig } from "../../src/state/slices/settings-slice";
import { browsergentStore } from "../../src/state/store";
import { IndexedDBStorage } from "../../src/storage/indexeddb-storage";
import type { StorageBackend } from "../../src/storage/storage-backend";

import "fake-indexeddb/auto";

type PendingSettingWrite = {
	store: string;
	key: string;
	complete: () => void;
};

class DeferredSettingsStorage implements StorageBackend {
	readonly writes: PendingSettingWrite[] = [];

	async get<T>(): Promise<T | null> {
		return null;
	}

	set<T>(store: string, key: string, _value: T): Promise<void> {
		return new Promise((resolve) => {
			this.writes.push({ store, key, complete: resolve });
		});
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

	completeWrite(index: number): void {
		const write = this.writes[index];
		if (!write) throw new Error(`Missing deferred write at index ${index}`);
		write.complete();
	}
}

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

	test("overlapping saves do not let an older snapshot replace newer edits", async () => {
		const delayedStorage = new DeferredSettingsStorage();
		const delayedController = new SettingsController(delayedStorage);
		const staleProviders = [anthropicConfig({ chatEndpointUrl: "" })];
		const latestProviders = [
			anthropicConfig({
				chatEndpointUrl: "http://127.0.0.1:45678/v1/messages",
			}),
		];

		const staleSave = delayedController.save({
			providers: staleProviders,
			activeProviderId: "p1",
		});
		await vi.waitFor(() => expect(delayedStorage.writes).toHaveLength(1));

		browsergentStore.getState().providersChanged(latestProviders);
		const latestSave = delayedController.save({
			providers: latestProviders,
			activeProviderId: "p1",
		});
		await Promise.resolve();
		// A newer save must wait for the earlier persistence operation rather
		// than letting its completion overwrite the live settings store.
		expect(delayedStorage.writes).toHaveLength(1);

		delayedStorage.completeWrite(0);
		await vi.waitFor(() => expect(delayedStorage.writes).toHaveLength(2));
		delayedStorage.completeWrite(1);
		await vi.waitFor(() => expect(delayedStorage.writes).toHaveLength(3));
		await staleSave;
		expect(browsergentStore.getState().settings.providers).toEqual(
			latestProviders,
		);

		delayedStorage.completeWrite(2);
		await vi.waitFor(() => expect(delayedStorage.writes).toHaveLength(4));
		delayedStorage.completeWrite(3);
		await latestSave;
		expect(browsergentStore.getState().settings.providers).toEqual(
			latestProviders,
		);
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
		{
			id: "stale",
			name: "Old",
			kind: "anthropic",
			baseUrl: "x",
			apiKey: "k",
			model: "m",
		},
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
