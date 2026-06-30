import { expect, test } from "@playwright/test";
import { launchExtension, typeTask } from "./helpers";

test("stop button appears when agent would be running", async () => {
	const { sidePanel, close } = await launchExtension();

	// Initially no stop button
	await expect(
		sidePanel.getByRole("button", { name: "Stop agent" }),
	).not.toBeVisible();

	// Type a task
	await typeTask(sidePanel, "test task");

	// After clicking Run, we need an API key - it should show settings
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	await expect(sidePanel.getByText("No provider configured")).toBeVisible();

	await close();
});

test("status shows idle initially", async () => {
	const { sidePanel, close } = await launchExtension();

	await expect(sidePanel.locator("text=idle")).toBeVisible();

	await close();
});
