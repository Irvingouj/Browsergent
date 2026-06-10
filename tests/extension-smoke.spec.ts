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
	await expect(
		sidePanel.getByRole("button", { name: "More options" }),
	).toBeVisible();

	await close();
});

test("side panel has task input and run button", async () => {
	const { sidePanel, close } = await launchExtension();

	const input = sidePanel.locator('input[data-testid="task-input"]');
	await expect(input).toBeVisible();

	const runButton = sidePanel.getByRole("button", { name: "Run task" });
	await expect(runButton).toBeVisible();

	await close();
});

test("settings panel stores API key", async () => {
	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByRole("button", { name: "Open settings" }).click();

	const apiKeyInput = sidePanel.locator('input[type="password"]');
	await expect(apiKeyInput).toBeVisible();

	await apiKeyInput.fill("test-key-123");
	await sidePanel.getByRole("button", { name: "Save settings" }).click();

	await expect(sidePanel.locator('input[type="password"]')).not.toBeVisible();
	await sidePanel.locator('[data-testid="close-session-panel"]').click();

	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByRole("button", { name: "Open settings" }).click();
	await expect(sidePanel.locator('input[type="password"]')).toHaveValue(
		"test-key-123",
	);

	await close();
});
