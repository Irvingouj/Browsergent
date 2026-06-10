import { expect, test } from "@playwright/test";
import { launchExtension, startMockAnthropicServer } from "./helpers";

async function configureMockSettings(sidePanel: any, mockUrl: string) {
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByRole("button", { name: "Open settings" }).click();
	await sidePanel.locator('input[type="password"]').fill("fake-key");
	await sidePanel.locator('input[type="text"]').nth(0).fill(mockUrl);
	await sidePanel.getByRole("button", { name: "Save settings" }).click();
	await sidePanel.locator('[data-testid="close-session-panel"]').click();
	await expect(sidePanel.getByTestId("new-session-button")).not.toBeVisible();
}

function makeTextStream(text: string) {
	return [
		`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
		`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
		`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}\n\n`,
		`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
	];
}

function makeToolStream(toolName: string, toolInput: Record<string, unknown>) {
	return [
		`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
		`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool-1", name: toolName, input: {} } })}\n\n`,
		`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(toolInput) } })}\n\n`,
		`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
	];
}

test("stop during provider stream", async () => {
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: makeTextStream("Working on it..."),
				delays: [0, 0, 3000, 0],
				stopReason: "end_turn",
			},
		],
	});
	const { sidePanel, close } = await launchExtension();
	await configureMockSettings(sidePanel, mock.url);

	await sidePanel
		.locator('input[data-testid="task-input"]')
		.fill("slow task");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	// Wait for stream to start (message_start + content_block_start sent quickly)
	await sidePanel.waitForTimeout(500);

	// Click stop while the delta is delayed
	await sidePanel.getByRole("button", { name: "Stop agent" }).click();

	// Assert status shows stopped
	await expect(sidePanel.locator('[data-testid="agent-status"]')).toHaveText(
		/stopped/,
		{ timeout: 5000 },
	);

	await close();
	mock.server.close();
});

test("stop during tool", async () => {
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: makeToolStream("run_js", { code: "page.snapshot()" }),
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: makeTextStream("Still working..."),
				delays: [0, 0, 3000, 0],
				stopReason: "end_turn",
			},
		],
	});
	const { sidePanel, close } = await launchExtension();
	await configureMockSettings(sidePanel, mock.url);

	await sidePanel
		.locator('input[data-testid="task-input"]')
		.fill("run tool");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	// Wait for tool to start (trace entry shows running)
	await expect(
		sidePanel.locator('[data-testid="trace-entry"]:has-text("run_js")'),
	).toBeVisible({ timeout: 5000 });

	// Click stop
	await sidePanel.getByRole("button", { name: "Stop agent" }).click();

	// Assert status shows stopped
	await expect(sidePanel.locator('[data-testid="agent-status"]')).toHaveText(
		/stopped/,
		{ timeout: 5000 },
	);

	await close();
	mock.server.close();
});
