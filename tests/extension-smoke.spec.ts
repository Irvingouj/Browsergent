import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchExtension } from "./helpers";

test("manifest grants host access for normal web pages", async () => {
	const manifestPath = path.resolve("dist/manifest.json");
	const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
		host_permissions?: string[];
	};

	expect(manifest.host_permissions).toEqual(["http://*/*", "https://*/*"]);
});

test("extension loads and side panel opens", async () => {
	const { sidePanel, close } = await launchExtension();

	await expect(sidePanel.locator("text=Browsergent")).toBeVisible();
	await expect(sidePanel.locator("text=Settings")).toBeVisible();

	await close();
});

test("side panel has task input and run button", async () => {
	const { sidePanel, close } = await launchExtension();

	const input = sidePanel.locator('input[placeholder="Type a task..."]');
	await expect(input).toBeVisible();

	const runButton = sidePanel.locator("text=Run");
	await expect(runButton).toBeVisible();

	await close();
});

test("settings panel stores API key", async () => {
	const { sidePanel, close } = await launchExtension();

	await sidePanel.locator("text=Settings").click();

	const apiKeyInput = sidePanel.locator('input[type="password"]');
	await expect(apiKeyInput).toBeVisible();

	await apiKeyInput.fill("test-key-123");
	await sidePanel.locator("text=Save").click();

	await expect(sidePanel.locator('input[type="password"]')).not.toBeVisible();

	await sidePanel.locator("text=Settings").click();
	await expect(sidePanel.locator('input[type="password"]')).toHaveValue(
		"test-key-123",
	);

	await close();
});
