import { expect, test } from "@playwright/test";
import {
	broadcastWindowSplit,
	clickRun,
	configureMockProvider,
	domClickButton,
	launchExtension,
	openSecondWindow,
	readPanelWindowId,
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

test.describe("window split lifecycle (B2)", () => {
	test("split event does not move sessions; source chat unchanged", async () => {
		const mock = startMockAnthropicServer({
			responses: [
				{
					chunks: [makeQuickChunk("Source chat")],
					delays: [0, 0, 0, 0],
					stopReason: "end_turn",
				},
			],
		});
		const {
			context,
			extensionId,
			sidePanel: panelA,
			close,
		} = await launchExtension();
		try {
			await configureMockProvider(panelA, mock.url);
			await typeTask(panelA, "task in source window");
			await clickRun(panelA);
			await expect(panelA.locator("text=Source chat")).toBeVisible({
				timeout: 15_000,
			});

			const windowA = await readPanelWindowId(panelA);
			const { sidePanel: panelB, windowId: windowB } = await openSecondWindow(
				context,
				extensionId,
				panelA,
			);
			expect(windowB).not.toBe(windowA);

			await broadcastWindowSplit(context, panelA, windowA, windowB);

			await expect(panelA.locator("text=Source chat")).toBeVisible();
			await expect(panelB.locator("text=Source chat")).not.toBeVisible();
			await expect(
				panelB.locator("text=task in source window"),
			).not.toBeVisible();
		} finally {
			await close();
			mock.server.close();
		}
	});

	test("after split event both windows keep independent sessions in list", async () => {
		test.setTimeout(90_000);
		const mock = startMockAnthropicServer({
			responses: [
				{
					chunks: [makeQuickChunk("A")],
					delays: [0, 0, 0, 0],
					stopReason: "end_turn",
				},
				{
					chunks: [makeQuickChunk("B")],
					delays: [0, 0, 0, 0],
					stopReason: "end_turn",
				},
			],
		});
		const {
			context,
			extensionId,
			sidePanel: panelA,
			close,
		} = await launchExtension();
		try {
			const windowA = await readPanelWindowId(panelA);
			const { sidePanel: panelB, windowId: windowB } = await openSecondWindow(
				context,
				extensionId,
				panelA,
			);

			await configureMockProvider(panelA, mock.url);
			await configureMockProvider(panelB, mock.url);

			await typeTask(panelA, "chat A");
			await clickRun(panelA);
			await expect(panelA.locator("text=A")).toBeVisible({ timeout: 15_000 });
			await expect(panelA.getByTestId("agent-status")).toContainText(/done/, {
				timeout: 15_000,
			});

			await typeTask(panelB, "chat B");
			await clickRun(panelB);
			await expect(panelB.locator("text=B")).toBeVisible({ timeout: 15_000 });
			await expect(panelB.getByTestId("agent-status")).toContainText(/done/, {
				timeout: 15_000,
			});

			await broadcastWindowSplit(context, panelA, windowA, windowB);
			await broadcastWindowSplit(context, panelB, windowA, windowB);

			await panelA.bringToFront();
			await domClickButton(panelA, "More options");
			const foreignOnA = panelA.locator(
				`[data-testid="session-item"]:has([data-testid="session-window-badge"]:text-is("Window ${windowB}"))`,
			);
			await expect(foreignOnA).toBeVisible({ timeout: 20_000 });
			await expect(foreignOnA).toHaveAttribute(
				"data-session-openable",
				"false",
			);

			await panelB.bringToFront();
			await domClickButton(panelB, "More options");
			const foreignOnB = panelB.locator(
				`[data-testid="session-item"]:has([data-testid="session-window-badge"]:text-is("Window ${windowA}"))`,
			);
			await expect(foreignOnB).toBeVisible({ timeout: 20_000 });
			await expect(foreignOnB).toHaveAttribute(
				"data-session-openable",
				"false",
			);
		} finally {
			await close();
			mock.server.close();
		}
	});

	test("second window first panel open does not inherit parent chat", async () => {
		const mock = startMockAnthropicServer({
			responses: [
				{
					chunks: [makeQuickChunk("Parent only")],
					delays: [0, 0, 0, 0],
					stopReason: "end_turn",
				},
			],
		});
		const {
			context,
			extensionId,
			sidePanel: panelA,
			close,
		} = await launchExtension();
		try {
			await configureMockProvider(panelA, mock.url);
			await typeTask(panelA, "parent window task");
			await clickRun(panelA);
			await expect(panelA.locator("text=Parent only")).toBeVisible({
				timeout: 15_000,
			});

			const { sidePanel: panelB } = await openSecondWindow(
				context,
				extensionId,
				panelA,
			);
			await expect(panelB.locator("text=parent window task")).not.toBeVisible();
			await expect(panelB.locator("text=Parent only")).not.toBeVisible();
			await expect(panelA.locator("text=Parent only")).toBeVisible();
		} finally {
			await close();
			mock.server.close();
		}
	});
});
