import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchExtension } from "./helpers";

test("manifest grants host access for normal web pages", async () => {
	const manifestPath = path.resolve("dist/manifest.json");
	const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
		action?: { default_icon?: Record<string, string> };
		host_permissions?: string[];
		icons?: Record<string, string>;
	};

	expect(manifest.host_permissions).toEqual(["http://*/*", "https://*/*"]);
	expect(manifest.icons?.["128"]).toBe("icons/icon-128.png");
	expect(manifest.action?.default_icon?.["32"]).toBe("icons/icon-32.png");
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

	const input = sidePanel.locator('[data-testid="task-input"]');
	await expect(input).toBeVisible();

	const runButton = sidePanel.getByRole("button", { name: "Run task" });
	await expect(runButton).toBeVisible();

	await close();
});

test("settings panel stores API key", async () => {
	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.getByTestId("settings-add-anthropic").click();

	const apiKeyInput = sidePanel.getByTestId("settings-apikey-input");
	await expect(apiKeyInput).toBeVisible();

	await apiKeyInput.fill("test-key-123");
	await sidePanel.getByTestId("settings-done-button").click();

	await expect(sidePanel.getByTestId("settings-apikey-input")).not.toBeVisible();

	await sidePanel.getByRole("button", { name: "Chat" }).click();
	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.locator('[data-testid^="settings-edit-"]').first().click();
	await expect(sidePanel.getByTestId("settings-apikey-input")).toHaveValue(
		"test-key-123",
	);

	await close();
});
