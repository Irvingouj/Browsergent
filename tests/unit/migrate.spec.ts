import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryStorage } from "../../src/storage/memory-storage";
import { migrateFromChromeStorage } from "../../src/storage/migrate";

describe("migrateFromChromeStorage", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("migrates session and history", async () => {
		vi.stubGlobal("chrome", {
			storage: {
				local: {
					get: vi.fn().mockResolvedValue({
						browsergentSession: {
							messages: [{ role: "user", content: "hi" }],
							trace: [],
						},
						browsergentConversationHistory: [
							{ role: "user", content: "hello" },
						],
					}),
				},
			},
		});

		await migrateFromChromeStorage(storage);

		const session = await storage.get("sessions", "current");
		expect(session).toEqual({
			messages: [{ role: "user", content: "hi" }],
			trace: [],
		});

		const history = await storage.get("history", "current");
		expect(history).toMatchObject({
			id: "current",
			messages: [{ role: "user", content: "hello" }],
		});
		expect((history as { timestamp: number }).timestamp).toBeTypeOf("number");

		const migrated = await storage.get("settings", "__migrated");
		expect(migrated).toBe(true);
	});

	test("migrates settings", async () => {
		vi.stubGlobal("chrome", {
			storage: {
				local: {
					get: vi.fn().mockResolvedValue({
						anthropicApiKey: "sk-key",
						anthropicBaseUrl: "https://api.example.com",
						anthropicModel: "claude-sonnet-4-6",
					}),
				},
			},
		});

		await migrateFromChromeStorage(storage);

		const providers = await storage.get<
			Array<{
				id: string;
				apiKey: string;
				baseUrl: string;
				model: string;
				kind: string;
			}>
		>("settings", "providers");
		expect(providers).toHaveLength(1);
		expect(providers?.[0]?.apiKey).toBe("sk-key");
		expect(providers?.[0]?.baseUrl).toBe("https://api.example.com");
		expect(providers?.[0]?.model).toBe("claude-sonnet-4-6");
		expect(providers?.[0]?.kind).toBe("anthropic");
		expect(await storage.get("settings", "activeProviderId")).toBe(
			providers?.[0]?.id,
		);
	});

	test("skips migration if already marked", async () => {
		await storage.set("settings", "__migrated", true);
		const getSpy = vi.fn().mockResolvedValue({});
		vi.stubGlobal("chrome", {
			storage: {
				local: {
					get: getSpy,
				},
			},
		});

		await migrateFromChromeStorage(storage);

		expect(getSpy).not.toHaveBeenCalled();
	});

	test("handles missing legacy data gracefully", async () => {
		vi.stubGlobal("chrome", {
			storage: {
				local: {
					get: vi.fn().mockResolvedValue({}),
				},
			},
		});

		await migrateFromChromeStorage(storage);

		expect(await storage.get("settings", "__migrated")).toBe(true);
		expect(await storage.get("sessions", "current")).toBeNull();
		expect(await storage.get("history", "current")).toBeNull();
	});

	test("partial migration still marks migrated", async () => {
		vi.stubGlobal("chrome", {
			storage: {
				local: {
					get: vi.fn().mockResolvedValue({
						anthropicApiKey: "sk-key",
					}),
				},
			},
		});

		await migrateFromChromeStorage(storage);

		const providers = await storage.get<Array<{ id: string; apiKey: string }>>(
			"settings",
			"providers",
		);
		expect(providers?.[0]?.apiKey).toBe("sk-key");
		expect(providers?.[0]?.baseUrl).toBe("https://api.anthropic.com");
		expect(await storage.get("settings", "__migrated")).toBe(true);
	});

	test("marks migrated even when chrome.storage.local throws", async () => {
		vi.stubGlobal("chrome", {
			storage: {
				local: {
					get: vi.fn().mockRejectedValue(new Error("permission denied")),
				},
			},
		});

		await migrateFromChromeStorage(storage);

		expect(await storage.get("settings", "__migrated")).toBe(true);
		expect(await storage.get("sessions", "current")).toBeNull();
		expect(await storage.get("settings", "apiKey")).toBeNull();
	});
});
