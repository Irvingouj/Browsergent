import { expect, test } from "@playwright/test";
import { launchExtension } from "./helpers";

test("add an Anthropic provider and verify it persists across navigation", async () => {
	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await expect(sidePanel.getByTestId("settings-list")).toBeVisible();

	// No error banner on a clean list view
	await expect(sidePanel.getByTestId("settings-error")).toHaveCount(0);

	await sidePanel.getByTestId("settings-add-anthropic").click();
	await expect(sidePanel.getByTestId("settings-edit")).toBeVisible();

	await sidePanel.getByTestId("settings-apikey-input").fill("sk-ant-test");
	await sidePanel
		.getByTestId("settings-baseurl-input")
		.fill("https://api.anthropic.com");
	await sidePanel.getByTestId("settings-model-input").fill("claude-sonnet-4-6");
	await sidePanel.getByTestId("settings-name-input").fill("My Anthropic");
	await sidePanel.getByTestId("settings-done-button").click();

	// Back to list — provider appears
	await expect(sidePanel.getByTestId("settings-list")).toBeVisible();
	await expect(sidePanel.getByText("My Anthropic")).toBeVisible();

	// Navigate away and back — persistence
	await sidePanel.getByRole("button", { name: "Chat" }).click();
	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await expect(sidePanel.getByText("My Anthropic")).toBeVisible();

	// No error banner on success path
	await expect(sidePanel.getByTestId("settings-error")).toHaveCount(0);

	await close();
});

test("edit an existing provider's fields and verify the change", async () => {
	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.getByTestId("settings-add-anthropic").click();
	await sidePanel.getByTestId("settings-apikey-input").fill("sk-original");
	await sidePanel.getByTestId("settings-model-input").fill("claude-original");
	await sidePanel.getByTestId("settings-done-button").click();

	// Edit it
	await sidePanel.locator('[data-testid^="settings-edit-"]').first().click();
	await expect(sidePanel.getByTestId("settings-edit")).toBeVisible();

	await sidePanel.getByTestId("settings-apikey-input").fill("sk-updated");
	await sidePanel.getByTestId("settings-model-input").fill("claude-updated");
	await sidePanel.getByTestId("settings-name-input").fill("Updated Provider");
	await sidePanel.getByTestId("settings-done-button").click();

	// List reflects updated name
	await expect(sidePanel.getByText("Updated Provider")).toBeVisible();

	// Re-open edit and verify the values stuck
	await sidePanel.locator('[data-testid^="settings-edit-"]').first().click();
	await expect(sidePanel.getByTestId("settings-apikey-input")).toHaveValue(
		"sk-updated",
	);
	await expect(sidePanel.getByTestId("settings-model-input")).toHaveValue(
		"claude-updated",
	);
	await expect(sidePanel.getByTestId("settings-name-input")).toHaveValue(
		"Updated Provider",
	);

	await close();
});

test("add an OpenAI-compatible provider", async () => {
	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.getByTestId("settings-add-openai").click();
	await expect(sidePanel.getByTestId("settings-edit")).toBeVisible();

	// Wire format select should show OpenAI-compatible
	await expect(sidePanel.getByTestId("settings-kind-select")).toHaveValue(
		"openai",
	);

	await sidePanel.getByTestId("settings-apikey-input").fill("sk-openai-test");
	await sidePanel
		.getByTestId("settings-baseurl-input")
		.fill("https://api.openai.com");
	await sidePanel.getByTestId("settings-model-input").fill("gpt-4o");
	await sidePanel.getByTestId("settings-name-input").fill("My OpenAI");
	await sidePanel.getByTestId("settings-done-button").click();

	await expect(sidePanel.getByTestId("settings-list")).toBeVisible();
	await expect(sidePanel.getByText("My OpenAI")).toBeVisible();
	// The kind/model line shows openai · gpt-4o
	await expect(sidePanel.getByText("openai · gpt-4o")).toBeVisible();

	await close();
});

test("delete a provider removes it from the list", async () => {
	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.getByTestId("settings-add-anthropic").click();
	await sidePanel.getByTestId("settings-name-input").fill("To Delete");
	await sidePanel.getByTestId("settings-done-button").click();

	await expect(sidePanel.getByText("To Delete")).toBeVisible();

	// Enter edit and delete
	await sidePanel.locator('[data-testid^="settings-edit-"]').first().click();
	await sidePanel.getByTestId("settings-delete-button").click();

	// Back to list — provider gone
	await expect(sidePanel.getByTestId("settings-list")).toBeVisible();
	await expect(sidePanel.getByText("To Delete")).toHaveCount(0);

	await close();
});
