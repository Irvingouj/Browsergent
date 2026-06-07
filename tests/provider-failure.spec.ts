import { expect, test } from "@playwright/test";
import { launchExtension, startMockAnthropicServer } from "./helpers";

test("agent shows error on 503 and UI remains usable", async () => {
	const mock = startMockAnthropicServer({ responses: [] });

	// Override to return 503
	mock.server.removeAllListeners("request");
	mock.server.on("request", (req, res) => {
		if (req.method === "OPTIONS") {
			res.writeHead(204, {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Headers":
					"content-type, x-api-key, anthropic-version, authorization",
				"Access-Control-Allow-Methods": "POST",
			});
			res.end();
			return;
		}
		if (req.url === "/v1/messages" && req.method === "POST") {
			res.writeHead(503, {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": "*",
			});
			res.end(
				JSON.stringify({
					error: { type: "overloaded_error", message: "Service overloaded" },
				}),
			);
		} else {
			res.writeHead(404);
			res.end();
		}
	});

	const { sidePanel, close } = await launchExtension();

	// Configure settings to point at mock server
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.locator('input[type="password"]').fill("test-key");
	await sidePanel.locator('input[type="text"]').nth(0).fill(mock.url);
	await sidePanel.locator('[data-testid="close-session-panel"]').click();
	await sidePanel.locator("text=Save").click();
	await expect(sidePanel.locator('input[type="password"]')).not.toBeVisible();

	// Start a run
	await sidePanel
		.locator('input[placeholder="Type a task..."]')
		.fill("test 503");
	await sidePanel.locator("text=Run").click();

	// Should show error status (hard stop)
	await expect(sidePanel.getByText("error", { exact: true })).toBeVisible({
		timeout: 10000,
	});

	// UI should remain usable — Run button visible
	await expect(sidePanel.locator("text=Run")).toBeVisible();

	await close();
	mock.server.close();
});
