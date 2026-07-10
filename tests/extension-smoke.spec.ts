import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
	domClickButton,
	domClickSelector,
	domClickTestId,
	domFillTestId,
	launchExtension,
} from "./helpers";

test("manifest grants host access for normal web pages", async () => {
	const manifestPath = path.resolve("dist/manifest.json");
	const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
		action?: { default_icon?: Record<string, string> };
		background?: { service_worker?: string; type?: string };
		host_permissions?: string[];
		icons?: Record<string, string>;
	};

	expect(manifest.background?.service_worker).toBe("background.js");
	expect(manifest.background?.type).toBe("module");
	expect(manifest.host_permissions).toEqual(["http://*/*", "https://*/*"]);
	expect(manifest.icons?.["128"]).toBe("icons/icon-128.png");
	expect(manifest.action?.default_icon?.["32"]).toBe("icons/icon-32.png");
});

test("extension loads and side panel opens", async () => {
	const { sidePanel, close } = await launchExtension();

	await expect(
		sidePanel.getByRole("button", { name: "More options" }),
	).toBeVisible();
	await expect(sidePanel.getByRole("button", { name: "Chat" })).toBeVisible();
	await expect(sidePanel.getByRole("button", { name: "Files" })).toBeVisible();
	await expect(
		sidePanel.getByRole("button", { name: "Settings" }),
	).toBeVisible();

	await close();
});

test("side panel has task input and run button", async () => {
	const { sidePanel, close } = await launchExtension();

	const input = sidePanel.locator('[data-testid="task-input"]');
	await expect(input).toBeVisible();

	const runButton = sidePanel.getByRole("button", { name: "Run task" });
	await expect(runButton).toBeVisible();

	await close();
});

test("settings panel stores API key", async () => {
	const { sidePanel, close } = await launchExtension();

	await domClickButton(sidePanel, "Settings");
	await domClickTestId(sidePanel, "settings-add-provider");
	await domClickTestId(sidePanel, "settings-add-anthropic");

	const hasEdit = await sidePanel.evaluate(
		() => !!document.querySelector('[data-testid="settings-edit"]'),
	);
	expect(hasEdit).toBe(true);

	await domFillTestId(sidePanel, "settings-apikey-input", "test-key-123");
	await domClickTestId(sidePanel, "settings-done-button");

	const stillEditing = await sidePanel.evaluate(
		() => !!document.querySelector('[data-testid="settings-apikey-input"]'),
	);
	expect(stillEditing).toBe(false);

	await domClickButton(sidePanel, "Chat");
	await domClickButton(sidePanel, "Settings");
	await domClickSelector(sidePanel, '[data-testid^="settings-edit-"]');
	const apiKey = await sidePanel.evaluate(
		() =>
			(
				document.querySelector(
					'[data-testid="settings-apikey-input"]',
				) as HTMLInputElement | null
			)?.value ?? null,
	);
	expect(apiKey).toBe("test-key-123");

	await close();
});
