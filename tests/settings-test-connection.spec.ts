import { expect, test } from "@playwright/test";
import { launchExtension } from "./helpers";

// Test Connection hits the provider endpoint from the side panel. We route
// the panel's fetch so no real network call leaves the test. The base URL is
// pointed at a dummy host so the route pattern matches reliably.

test("Test Connection shows success on a 2xx response", async () => {
	const { sidePanel, close } = await launchExtension();

	await sidePanel.route("**/v1/messages", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				id: "msg_test",
				type: "message",
				role: "assistant",
				content: [{ type: "text", text: "ok" }],
				model: "claude-test",
				stop_reason: "end_turn",
				usage: { input_tokens: 1, output_tokens: 1 },
			}),
		}),
	);

	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.getByTestId("settings-add-anthropic").click();
	await expect(sidePanel.getByTestId("settings-edit")).toBeVisible();

	await sidePanel
		.getByTestId("settings-baseurl-input")
		.fill("https://provider.test");
	await sidePanel.getByTestId("settings-apikey-input").fill("sk-test");
	await sidePanel.getByTestId("settings-model-input").fill("claude-test");

	await sidePanel.getByTestId("settings-test-connection-button").click();

	// Green success indicator with the exact copy from the issue.
	const result = sidePanel.getByTestId("settings-test-result");
	await expect(result).toBeVisible();
	await expect(result).toContainText("Connection successful");

	await close();
});

test("Test Connection shows a classified inline error on 401", async () => {
	const { sidePanel, close } = await launchExtension();

	await sidePanel.route("**/v1/messages", (route) =>
		route.fulfill({
			status: 401,
			contentType: "application/json",
			body: JSON.stringify({ error: { message: "invalid api key" } }),
		}),
	);

	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.getByTestId("settings-add-anthropic").click();
	await expect(sidePanel.getByTestId("settings-edit")).toBeVisible();

	await sidePanel
		.getByTestId("settings-baseurl-input")
		.fill("https://provider.test");
	await sidePanel.getByTestId("settings-apikey-input").fill("sk-bad");
	await sidePanel.getByTestId("settings-model-input").fill("claude-test");

	await sidePanel.getByTestId("settings-test-connection-button").click();

	const result = sidePanel.getByTestId("settings-test-result");
	await expect(result).toBeVisible();
	// Error is inline (not a toast/modal) and carries the typed code.
	await expect(result).toContainText("E_PROVIDER_AUTH");
	await expect(result).toContainText("401");

	// The persisted-settings error banner is NOT triggered by a test failure.
	await expect(sidePanel.getByTestId("settings-error")).toHaveCount(0);

	await close();
});

// Helper: open edit view for a fresh Anthropic provider pointed at provider.test.
async function openEditForTest(sidePanel: import("@playwright/test").Page) {
	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.getByTestId("settings-add-anthropic").click();
	await expect(sidePanel.getByTestId("settings-edit")).toBeVisible();
	await sidePanel
		.getByTestId("settings-baseurl-input")
		.fill("https://provider.test");
	await sidePanel.getByTestId("settings-apikey-input").fill("sk-test");
	await sidePanel.getByTestId("settings-model-input").fill("claude-test");
}

test("Test Connection shows the in-flight Testing… state and disables the button", async () => {
	const { sidePanel, close } = await launchExtension();

	// A route that never fulfills until we say so — keeps the request in flight.
	const { promise: inFlight, resolve: resolveRequest } =
		Promise.withResolvers<void>();
	await sidePanel.route("**/v1/messages", async (route) => {
		await inFlight;
		route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
	});

	await openEditForTest(sidePanel);
	const button = sidePanel.getByTestId("settings-test-connection-button");
	await button.click();

	// While in flight: button is disabled and shows the in-flight label.
	await expect(button).toBeDisabled();
	await expect(button).toHaveText("Testing…");
	// No result indicator yet.
	await expect(sidePanel.getByTestId("settings-test-result")).toHaveCount(0);

	// Release the request → settles back to the idle label, still no result card
	// (we don't assert success here; the success test covers that).
	resolveRequest();

	await close();
});

test("Test Connection error result can be dismissed with the × button", async () => {
	const { sidePanel, close } = await launchExtension();

	await sidePanel.route("**/v1/messages", (route) =>
		route.fulfill({
			status: 401,
			contentType: "application/json",
			body: JSON.stringify({ error: { message: "invalid api key" } }),
		}),
	);

	await openEditForTest(sidePanel);
	await sidePanel.getByTestId("settings-test-connection-button").click();

	const result = sidePanel.getByTestId("settings-test-result");
	await expect(result).toBeVisible();

	// Dismiss the inline error.
	await sidePanel.locator('[data-testid="settings-test-result"] button').click();
	await expect(sidePanel.getByTestId("settings-test-result")).toHaveCount(0);

	await close();
});

test("Test Connection result resets when switching to a different provider", async () => {
	const { sidePanel, close } = await launchExtension();

	await sidePanel.route("**/v1/messages", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: "{}",
		}),
	);

	await openEditForTest(sidePanel);
	await sidePanel.getByTestId("settings-test-connection-button").click();
	await expect(sidePanel.getByTestId("settings-test-result")).toBeVisible();

	// Leave edit view → back to the list. The result must not cling to the form.
	await sidePanel.getByTestId("settings-back-button").click();
	await expect(sidePanel.getByTestId("settings-list")).toBeVisible();
	await expect(sidePanel.getByTestId("settings-test-result")).toHaveCount(0);

	// Re-enter edit on the same provider → result is gone, no stale green indicator.
	await sidePanel.locator('[data-testid^="settings-edit-"]').first().click();
	await expect(sidePanel.getByTestId("settings-edit")).toBeVisible();
	await expect(sidePanel.getByTestId("settings-test-result")).toHaveCount(0);

	await close();
});

test("Test Connection shows an inline error when the network request throws", async () => {
	const { sidePanel, close } = await launchExtension();

	// Abort the request at the transport layer — fetch rejects (no HTTP status).
	await sidePanel.route("**/v1/messages", (route) => route.abort("failed"));

	await openEditForTest(sidePanel);
	await sidePanel.getByTestId("settings-test-connection-button").click();

	const result = sidePanel.getByTestId("settings-test-result");
	await expect(result).toBeVisible();
	// Network failures are classified as E_NETWORK and shown inline.
	await expect(result).toContainText("E_NETWORK");

	await close();
});