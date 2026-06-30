import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	launchExtension,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

test("chat messages accumulate across multiple runs", async () => {
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "First response" } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
				],
				delays: [0, 0, 0, 0],
				stopReason: "end_turn",
			},
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-2", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Second response" } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
				],
				delays: [0, 0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});

	const { sidePanel, close } = await launchExtension();

	await configureMockProvider(sidePanel, mock.url);

	// First run
	await typeTask(sidePanel, "first task");
	await sidePanel.getByRole("button", { name: "Run task" }).click();
	await expect(sidePanel.locator("text=First response")).toBeVisible({
		timeout: 10000,
	});

	// Second run
	await typeTask(sidePanel, "second task");
	await sidePanel.getByRole("button", { name: "Run task" }).click();
	await expect(sidePanel.locator("text=Second response")).toBeVisible({
		timeout: 10000,
	});

	// Both user messages should be visible
	await expect(sidePanel.locator("text=first task")).toBeVisible();
	await expect(sidePanel.locator("text=second task")).toBeVisible();

	// Both assistant responses should be visible
	await expect(sidePanel.locator("text=First response")).toBeVisible();
	await expect(sidePanel.locator("text=Second response")).toBeVisible();

	await close();
	mock.server.close();
});
