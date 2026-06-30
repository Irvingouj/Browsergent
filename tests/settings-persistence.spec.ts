import { expect, test } from "@playwright/test";
import { launchExtension } from "./helpers";

test("settings save and load within a session", async () => {
	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.getByTestId("settings-add-anthropic").click();
	await sidePanel.getByTestId("settings-apikey-input").fill("sk-test-key");
	await sidePanel
		.getByTestId("settings-baseurl-input")
		.fill("https://custom.example.com");
	await sidePanel.getByTestId("settings-model-input").fill("claude-test-model");
	await sidePanel.getByTestId("settings-done-button").click();

	await expect(sidePanel.getByTestId("settings-list")).toBeVisible();

	await sidePanel.getByRole("button", { name: "Chat" }).click();
	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.locator('[data-testid^="settings-edit-"]').first().click();
	await expect(sidePanel.getByTestId("settings-apikey-input")).toHaveValue(
		"sk-test-key",
	);
	await expect(sidePanel.getByTestId("settings-baseurl-input")).toHaveValue(
		"https://custom.example.com",
	);
	await expect(sidePanel.getByTestId("settings-model-input")).toHaveValue(
		"claude-test-model",
	);

	await close();
});
