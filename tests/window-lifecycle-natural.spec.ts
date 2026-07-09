import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	launchExtension,
	mergeWindowsByMovingTab,
	openSecondWindow,
	pollPersistedRunningSessions,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

function makeQuickChunk(text: string) {
	return (
		`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: `msg-${text}`, type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n` +
		`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n` +
		`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}\n\n` +
		`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`
	);
}

test.describe("natural window lifecycle", () => {
	// Playwright headless Chromium still does not emit tabs.onDetached/onAttached
	// for extension-window tab moves. Coordinator logic is unit-tested; merge E2E
	// uses broadcastWindowMerge. Re-enable with headed Chrome or harness fix.
	test.fixme("tab move merge rebinds session without broadcast helper", async () => {
		test.setTimeout(60_000);
		const mock = startMockAnthropicServer({
			responses: [
				{
					chunks: [makeQuickChunk("Natural merge")],
					delays: [0, 0, 0, 0],
					stopReason: "end_turn",
				},
			],
		});
		const { context, extensionId, sidePanel: panelA, close } =
			await launchExtension();
		try {
			const windowA = Number(
				await panelA
					.locator('[data-initialized="true"]')
					.getAttribute("data-window-id"),
			);
			const { sidePanel: panelB, windowId: windowB } = await openSecondWindow(
				context,
				extensionId,
				panelA,
			);
			await configureMockProvider(panelA, mock.url);
			await configureMockProvider(panelB, mock.url);

			await typeTask(panelB, "natural merge session");
			await panelB.getByRole("button", { name: "Run task" }).click();
			await expect(panelB.locator("text=Natural merge")).toBeVisible({
				timeout: 10000,
			});

			await panelA.bringToFront();
			await mergeWindowsByMovingTab(panelB, windowB, windowA);
			await panelA.waitForTimeout(1000);

			await panelA.getByRole("button", { name: "More options" }).click();
			const mergedRow = panelA
				.locator(
					`[data-testid="session-item"]:has([data-testid="session-window-badge"]:text-is("Window ${windowA}"))`,
				)
				.filter({ hasText: "2 messages" });
			await expect
				.poll(async () => mergedRow.getAttribute("data-session-openable"), {
					timeout: 15000,
				})
				.toBe("true");
			await mergedRow.click();
			await expect(panelA.locator("text=natural merge session")).toBeVisible({
				timeout: 5000,
			});
		} finally {
			await close();
			mock.server.close();
		}
	});

	test("cross-window running syncs to storage while panel A stays closed", async () => {
		const mock = startMockAnthropicServer({
			responses: [
				{
					chunks: [makeQuickChunk("B warmup")],
					delays: [0, 0, 0, 0],
					stopReason: "end_turn",
				},
				{
					chunks: [
						`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-slow", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					],
					delays: [4000],
					stopReason: "end_turn",
				},
			],
		});
		const { context, extensionId, sidePanel: panelA, close } =
			await launchExtension();
		try {
			const { sidePanel: panelB } = await openSecondWindow(
				context,
				extensionId,
				panelA,
			);
			await configureMockProvider(panelA, mock.url);
			await configureMockProvider(panelB, mock.url);

			await typeTask(panelB, "warmup");
			await panelB.getByRole("button", { name: "Run task" }).click();
			await expect(
				panelB.locator('[data-testid="chat-message-assistant"]'),
			).toContainText("B warmup", { timeout: 10000 });

			await panelA.bringToFront();
			await typeTask(panelB, "slow cross-window");
			await panelB.getByRole("button", { name: "Run task" }).click();
			await expect(panelB.getByTestId("agent-status")).not.toHaveText(
				/^(idle|done|stopped)$/,
				{ timeout: 5000 },
			);

			await pollPersistedRunningSessions(panelA, 1);
		} finally {
			await close();
			mock.server.close();
		}
	});
});