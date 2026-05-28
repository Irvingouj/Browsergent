import { expect, test } from "@playwright/test";
import { launchExtension, startMockAnthropicServer } from "./helpers";

test("agent shows error when API returns 401", async () => {
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
				],
				delays: [0],
				stopReason: "end_turn",
			},
		],
	});

	// Override the mock server to return 401 on the first request
	mock.server.removeAllListeners("request");
	mock.server.on("request", (req, res) => {
		if (req.method === "OPTIONS") {
			res.writeHead(204, {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Headers": "content-type, x-api-key, anthropic-version, authorization",
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
			res.end(JSON.stringify({ error: { type: "authentication_error", message: "Invalid API key" } }));
		} else {
			res.writeHead(404);
			res.end();
		}
	});

	const { sidePanel, close } = await launchExtension();

	await sidePanel.locator("text=Settings").click();
	await sidePanel.locator('input[type="password"]').fill("bad-key");
	await sidePanel.locator('input[type="text"]').nth(0).fill(mock.url);
	await sidePanel.locator("text=Save").click();
	await expect(sidePanel.locator('input[type="password"]')).not.toBeVisible();

	await sidePanel.locator('input[placeholder="Type a task..."]').fill("test error");
	await sidePanel.locator("text=Run").click();

	// Status should show error
	await expect(sidePanel.locator("text=Status: error")).toBeVisible({ timeout: 10000 });

	await close();
	mock.server.close();
});
