import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	launchExtension,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

function makeQuickChunk(text: string = "Done") {
	return (
		`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-quick", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n` +
		`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n` +
		`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}\n\n` +
		`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`
	);
}

function makeSlowChunk() {
	return `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-slow", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`;
}

test.describe("background headless session", () => {
	test("switching sessions keeps prior run alive and shows running badge", async () => {
		const mock = startMockAnthropicServer({
			responses: [
				{
					chunks: [makeQuickChunk()],
					delays: [0, 0, 0, 0],
					stopReason: "end_turn",
				},
				{
					chunks: [makeSlowChunk()],
					delays: [4000],
					stopReason: "end_turn",
				},
			],
		});
		const { sidePanel, close } = await launchExtension();
		try {
			await configureMockProvider(sidePanel, mock.url);
			await typeTask(sidePanel, "quick task");
			await sidePanel.getByRole("button", { name: "Run task" }).click();
			await expect(
				sidePanel.locator('[data-testid="chat-message-assistant"]'),
			).toContainText("Done", { timeout: 10000 });

			await sidePanel.getByTestId("floating-new-button").click();
			await typeTask(sidePanel, "slow background task");
			await sidePanel.getByRole("button", { name: "Run task" }).click();
			await expect(sidePanel.getByTestId("agent-status")).not.toHaveText(
				/^(idle|done|stopped)$/,
				{ timeout: 5000 },
			);

			await sidePanel.getByRole("button", { name: "More options" }).click();
			const sessionItems = sidePanel.locator('[data-testid="session-item"]');
			await expect(sessionItems).toHaveCount(2);
			await expect(
				sidePanel.locator('[data-testid="session-running-badge"]').first(),
			).toBeVisible({ timeout: 5000 });

			await sessionItems.nth(1).click();
			await expect(sidePanel.locator("text=quick task")).toBeVisible({
				timeout: 5000,
			});
			await sidePanel.getByRole("button", { name: "More options" }).click();
			await expect(
				sidePanel.locator('[data-testid="session-running-badge"]').first(),
			).toBeVisible();
		} finally {
			await close();
			mock.server.close();
		}
	});

	test("returning to headless session subscribes to live run state", async () => {
		const mock = startMockAnthropicServer({
			responses: [
				{
					chunks: [makeQuickChunk()],
					delays: [0, 0, 0, 0],
					stopReason: "end_turn",
				},
				{
					chunks: [
						makeSlowChunk(),
						`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
						`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Still going" } })}\n\n`,
						`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
					],
					delays: [2000, 0, 0, 0],
					stopReason: "end_turn",
				},
			],
		});
		const { sidePanel, close } = await launchExtension();
		try {
			await configureMockProvider(sidePanel, mock.url);
			await typeTask(sidePanel, "first done");
			await sidePanel.getByRole("button", { name: "Run task" }).click();
			await expect(
				sidePanel.locator('[data-testid="chat-message-assistant"]'),
			).toContainText("Done", { timeout: 10000 });

			await sidePanel.getByTestId("floating-new-button").click();
			await typeTask(sidePanel, "slow headless");
			await sidePanel.getByRole("button", { name: "Run task" }).click();
			await sidePanel.waitForTimeout(400);

			await sidePanel.getByRole("button", { name: "More options" }).click();
			await sidePanel.locator('[data-testid="session-item"]').nth(1).click();
			await expect(sidePanel.locator("text=first done")).toBeVisible();

			await sidePanel.getByRole("button", { name: "More options" }).click();
			await sidePanel.locator('[data-testid="session-item"]').first().click();
			await expect(sidePanel.getByTestId("agent-status")).not.toHaveText(
				"idle",
			);
			await expect(
				sidePanel.locator('[data-testid="chat-message-assistant"]').last(),
			).toContainText("Still going", { timeout: 15000 });
		} finally {
			await close();
			mock.server.close();
		}
	});

	test("foreground session can start a new run while another runs headless", async () => {
		const mock = startMockAnthropicServer({
			responses: [
				{
					chunks: [makeQuickChunk()],
					delays: [0, 0, 0, 0],
					stopReason: "end_turn",
				},
				{
					chunks: [makeSlowChunk()],
					delays: [3000],
					stopReason: "end_turn",
				},
				{
					chunks: [makeQuickChunk("Foreground OK")],
					delays: [0, 0, 0, 0],
					stopReason: "end_turn",
				},
			],
		});
		const { sidePanel, close } = await launchExtension();
		try {
			await configureMockProvider(sidePanel, mock.url);
			await typeTask(sidePanel, "warmup");
			await sidePanel.getByRole("button", { name: "Run task" }).click();
			await expect(
				sidePanel.locator('[data-testid="chat-message-assistant"]'),
			).toContainText("Done", { timeout: 10000 });

			await sidePanel.getByTestId("floating-new-button").click();
			await typeTask(sidePanel, "slow headless run");
			await sidePanel.getByRole("button", { name: "Run task" }).click();
			await expect(sidePanel.getByTestId("agent-status")).not.toHaveText(
				/^(idle|done|stopped)$/,
				{ timeout: 5000 },
			);

			await sidePanel.getByRole("button", { name: "More options" }).click();
			await sidePanel.locator('[data-testid="session-item"]').nth(1).click();
			await expect(sidePanel.locator("text=warmup")).toBeVisible({
				timeout: 5000,
			});

			await typeTask(sidePanel, "parallel foreground");
			await sidePanel.getByRole("button", { name: "Run task" }).click();
			await expect(
				sidePanel.locator('[data-testid="chat-message-assistant"]').last(),
			).toContainText("Foreground OK", { timeout: 15000 });
		} finally {
			await close();
			mock.server.close();
		}
	});
});
