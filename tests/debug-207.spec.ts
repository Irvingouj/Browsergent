import { expect, test } from "@playwright/test";
import { launchExtension, startMockAnthropicServer } from "./helpers";

test("debug 207 streaming", async () => {
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-6", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "I'll check the page." } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "run_js", input: {} } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"code":"print(\'checked\')"}' } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 1 })}\n\n`,
				],
				delays: [0, 0, 0, 0, 0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-7", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Checked." } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
				],
				delays: [0, 0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});

	const { sidePanel, close } = await launchExtension();
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.locator('input[type="password"]').fill("fake-key");
	await sidePanel.locator('input[type="text"]').nth(0).fill(mock.url);
	await sidePanel.getByRole("button", { name: "Save" }).click();
	await sidePanel.locator('[data-testid="close-session-panel"]').click();

	await sidePanel.locator('input[placeholder="Type a task..."]').fill("what page are we at");
	await sidePanel.getByRole("button", { name: "Run" }).click();

	// Wait for the first response
	await expect(sidePanel.locator("text=I'll check the page.")).toBeVisible({ timeout: 5000 });

	// Wait for status to change
	await sidePanel.waitForTimeout(2000);

	console.log("Request bodies count:", mock.requestBodies.length);
	for (let i = 0; i < mock.requestBodies.length; i++) {
		console.log(`Request ${i}:`, JSON.stringify(mock.requestBodies[i]).slice(0, 500));
	}

	// Check current status
	const statusText = await sidePanel.locator("text=Status:").textContent();
	console.log("Status text:", statusText);

	await sidePanel.waitForTimeout(2000);

	await close();
	mock.server.close();
});
