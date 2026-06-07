import { expect, test } from "@playwright/test";
import { launchExtension } from "./helpers";

test("settings save and load within a session", async () => {
	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.locator('input[type="password"]').fill("sk-test-key");
	await sidePanel
		.locator('input[type="text"]')
		.nth(0)
		.fill("https://custom.example.com");
	await sidePanel
		.locator('input[type="text"]')
		.nth(1)
		.fill("claude-test-model");
	await sidePanel.locator('[data-testid="close-session-panel"]').click();
	await sidePanel.locator("text=Save").click();

	// Wait for settings to close
	await expect(sidePanel.locator('input[type="password"]')).not.toBeVisible();

	// Re-open settings and verify values are loaded
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await expect(sidePanel.locator('input[type="password"]')).toHaveValue(
		"sk-test-key",
	);
	await expect(sidePanel.locator('input[type="text"]').nth(0)).toHaveValue(
		"https://custom.example.com",
	);
	await expect(sidePanel.locator('input[type="text"]').nth(1)).toHaveValue(
		"claude-test-model",
	);

	await close();
});
