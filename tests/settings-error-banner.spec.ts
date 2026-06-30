import { expect, test } from "@playwright/test";
import { launchExtension } from "./helpers";

/** Break IndexedDB transactions so SettingsController.save() rejects, producing
 *  a real E_SETTINGS_PERSIST error that the banner must surface. */
function breakIndexedDB() {
	return `
		IDBDatabase.prototype.transaction = function () {
			throw new DOMException("quota exceeded", "QuotaExceededError");
		};
	`;
}

test("settings error banner renders on real storage failure", async () => {
	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.getByTestId("settings-add-anthropic").click();
	await sidePanel.getByTestId("settings-apikey-input").fill("sk-test");
	await sidePanel.getByTestId("settings-done-button").click();
	await expect(sidePanel.getByTestId("settings-list")).toBeVisible();

	// No banner initially
	await expect(sidePanel.getByTestId("settings-error")).toHaveCount(0);

	// Break IndexedDB so the next save fails for real
	await sidePanel.evaluate(breakIndexedDB());

	// Edit the provider → providersChanged → persist → save() → IDB throws → E_SETTINGS_PERSIST
	await sidePanel.locator('[data-testid^="settings-edit-"]').first().click();
	await sidePanel.getByTestId("settings-apikey-input").fill("sk-changed");
	await sidePanel.getByTestId("settings-done-button").click();

	// The banner should appear with the real error message
	await expect(sidePanel.getByTestId("settings-error")).toBeVisible({
		timeout: 10000,
	});
	await expect(
		sidePanel.locator('[data-testid="settings-error"]'),
	).toContainText(/quota|storage|failed/i);

	await close();
});

test("settings error banner dismisses via the × button", async () => {
	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.getByTestId("settings-add-anthropic").click();
	await sidePanel.getByTestId("settings-apikey-input").fill("sk-test");
	await sidePanel.getByTestId("settings-done-button").click();

	// Break IDB and trigger a save failure
	await sidePanel.evaluate(breakIndexedDB());
	await sidePanel.locator('[data-testid^="settings-edit-"]').first().click();
	await sidePanel.getByTestId("settings-apikey-input").fill("sk-changed");
	await sidePanel.getByTestId("settings-done-button").click();

	await expect(sidePanel.getByTestId("settings-error")).toBeVisible({
		timeout: 10000,
	});

	// Dismiss
	await sidePanel.locator('[data-testid="settings-error"] button').click();
	await expect(sidePanel.getByTestId("settings-error")).toHaveCount(0);

	await close();
});
