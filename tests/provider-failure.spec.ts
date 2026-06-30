import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	launchExtension,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

test("agent shows provider error and UI remains usable", async () => {
	const mock = startMockAnthropicServer({ responses: [] });

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
			res.writeHead(401, {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": "*",
			});
			res.end(
				JSON.stringify({
					error: { type: "authentication_error", message: "Invalid API key" },
				}),
			);
		} else {
			res.writeHead(404);
			res.end();
		}
	});

	const { sidePanel, close } = await launchExtension();

	await configureMockProvider(sidePanel, mock.url);

	// Start a run
	await typeTask(sidePanel, "test 401");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	// Should show error status (hard stop)
	await expect(sidePanel.getByText("error", { exact: true })).toBeVisible({
		timeout: 10000,
	});

	// UI should remain usable — Run button visible
	await expect(
		sidePanel.getByRole("button", { name: "Run task" }),
	).toBeVisible();

	await close();
	mock.server.close();
});
