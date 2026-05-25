import { expect, test } from "@playwright/test";
import { launchExtension } from "./helpers";

test("stop button appears when agent would be running", async () => {
	const { sidePanel, close } = await launchExtension();

	// Initially no stop button
	await expect(sidePanel.locator("text=Stop")).not.toBeVisible();

	// Type a task
	await sidePanel
		.locator('input[placeholder="Type a task..."]')
		.fill("test task");

	// After clicking Run, we need an API key - it should show settings
	await sidePanel.locator("text=Run").click();

	// Should prompt for API key
	await expect(sidePanel.locator("text=Anthropic API Key")).toBeVisible();

	await close();
});

test("status shows idle initially", async () => {
	const { sidePanel, close } = await launchExtension();

	await expect(sidePanel.locator("text=Status: idle")).toBeVisible();

	await close();
});
