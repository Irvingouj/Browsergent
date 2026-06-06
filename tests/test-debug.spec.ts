import { expect, test } from "@playwright/test";
import { launchExtension, startMockAnthropicServer } from "./helpers";

test("debug agent error", async () => {
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

	sidePanel.on("console", (msg) => {
		console.log("[CONSOLE]", msg.type(), msg.text());
	});

	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.locator('input[type="password"]').fill("bad-key");
	await sidePanel.locator('input[type="text"]').nth(0).fill(mock.url);
	await sidePanel.locator("text=Save").click();
	await expect(sidePanel.locator('input[type="password"]')).not.toBeVisible();

	await sidePanel.locator('[data-testid="close-session-panel"]').click();

	await sidePanel
		.locator('input[placeholder="Type a task..."]')
		.fill("test error");
	await sidePanel.locator("text=Run").click();

	await sidePanel.waitForTimeout(3000);

	console.log("Request bodies:", JSON.stringify(mock.requestBodies));

	await close();
	mock.server.close();
});
