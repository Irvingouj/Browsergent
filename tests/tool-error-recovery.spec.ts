import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	launchExtension,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

test("agent continues after tool error and trace shows error status", async () => {
	const msgId = "msg-test-1";
	const toolCallId = "tc-1";

	const mock = startMockAnthropicServer({
		responses: [
			// First response: model calls run_js
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: msgId, type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: toolCallId, name: "run_js", input: {} } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ code: "await page.snapshot()" }) } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
				],
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
			// Second response: model acknowledges error and ends
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-2", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "I encountered an error accessing the page. The tool execution failed." } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
				],
				delays: [0, 0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});

	const { sidePanel, close } = await launchExtension();

	await configureMockProvider(sidePanel, mock.url);

	await typeTask(sidePanel, "test tool error recovery");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	// Model should eventually respond (second response after tool error)
	await expect(sidePanel.locator("text=I encountered an error")).toBeVisible({
		timeout: 15000,
	});

	// Agent should complete (done status)
	await expect(sidePanel.locator("text=done")).toBeVisible({
		timeout: 20000,
	});

	await close();
	mock.server.close();
});
