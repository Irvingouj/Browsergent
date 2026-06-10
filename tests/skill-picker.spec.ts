import { expect, test } from "@playwright/test";
import { launchExtension } from "./helpers";

test("/ picker inserts skill token into task input", async () => {
	test.setTimeout(60000);
	const { sidePanel, close } = await launchExtension();

	const taskInput = sidePanel.locator('input[data-testid="task-input"]');
	await taskInput.click();
	await taskInput.fill("/");
	await expect(sidePanel.getByTestId("command-picker")).toBeVisible({
		timeout: 5000,
	});
	await expect(
		sidePanel
			.getByTestId("command-picker")
			.locator("text=skill:capability-check")
			.first(),
	).toBeVisible();

	await sidePanel.getByTestId("command-picker-item-capability-check").click();

	const value = await taskInput.inputValue();
	expect(value).toBe("/skill:capability-check ");

	await close();
});
