import { expect, test } from "@playwright/test";
import { launchExtension, uploadFileViaPanel } from "./helpers";

test("@ picker inserts file mention token into task input", async () => {
	test.setTimeout(60000);
	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.getByTestId("files-panel")).toBeVisible({
		timeout: 10000,
	});
	await uploadFileViaPanel(
		sidePanel,
		"picker.txt",
		"picker test content",
		"text/plain",
	);
	await expect(sidePanel.locator("text=picker.txt")).toBeVisible({
		timeout: 10000,
	});

	await sidePanel.getByRole("button", { name: "Chat" }).click();
	const taskInput = sidePanel.locator('input[data-testid="task-input"]');
	await taskInput.click();
	await taskInput.fill("@");
	await expect(sidePanel.getByTestId("command-picker")).toBeVisible({
		timeout: 5000,
	});
	await expect(
		sidePanel.getByTestId("command-picker").locator("text=picker.txt").first(),
	).toBeVisible();

	await sidePanel.getByTestId(/^command-picker-item-/).first().click();

	const value = await taskInput.inputValue();
	expect(value).toMatch(/@\[file:[^:\]]+:picker\.txt\]/);

	await close();
});
