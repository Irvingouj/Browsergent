import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	launchExtension,
	openSecondWindow,
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

test.describe("two-window session isolation", () => {
	test("two windows keep independent chat sessions", async () => {
		const mock = startMockAnthropicServer({
			responses: [
				{ chunks: [makeQuickChunk("Reply A")], delays: [0, 0, 0, 0], stopReason: "end_turn" },
				{ chunks: [makeQuickChunk("Reply B")], delays: [0, 0, 0, 0], stopReason: "end_turn" },
			],
		});
		const { context, extensionId, sidePanel: panelA, close } =
			await launchExtension();
		try {
			const { sidePanel: panelB, windowId: windowB } = await openSecondWindow(
				context,
				extensionId,
				panelA,
			);
			const windowA = Number(
				await panelA
					.locator('[data-initialized="true"]')
					.getAttribute("data-window-id"),
			);
			expect(windowA).toBeGreaterThan(0);
			expect(windowB).toBeGreaterThan(0);
			expect(windowA).not.toBe(windowB);

			await configureMockProvider(panelA, mock.url);
			await configureMockProvider(panelB, mock.url);

			await typeTask(panelA, "task window A");
			await panelA.getByRole("button", { name: "Run task" }).click();
			await expect(panelA.locator("text=Reply A")).toBeVisible({
				timeout: 10000,
			});

			await typeTask(panelB, "task window B");
			await panelB.getByRole("button", { name: "Run task" }).click();
			await expect(panelB.locator("text=Reply B")).toBeVisible({
				timeout: 10000,
			});

			await expect(panelA.locator("text=Reply B")).not.toBeVisible();
			await expect(panelB.locator("text=Reply A")).not.toBeVisible();
		} finally {
			await close();
			mock.server.close();
		}
	});

	test("session list in window A disables rows attached to window B", async () => {
		const mock = startMockAnthropicServer({
			responses: [
				{ chunks: [makeQuickChunk("B")], delays: [0, 0, 0, 0], stopReason: "end_turn" },
			],
		});
		const { context, extensionId, sidePanel: panelA, close } =
			await launchExtension();
		try {
			const { sidePanel: panelB, windowId: windowB } = await openSecondWindow(
				context,
				extensionId,
				panelA,
			);
			await configureMockProvider(panelA, mock.url);
			await configureMockProvider(panelB, mock.url);

			await typeTask(panelB, "only in B");
			await panelB.getByRole("button", { name: "Run task" }).click();
			await expect(
				panelB.locator('[data-testid="chat-message-assistant"]'),
			).toContainText("B", { timeout: 10000 });

			await panelA.getByRole("button", { name: "More options" }).click();
			const foreignRow = panelA.locator(
				`[data-testid="session-item"]:has([data-testid="session-window-badge"]:text-is("Window ${windowB}"))`,
			);
			await expect(foreignRow).toBeVisible({ timeout: 5000 });
			await expect(foreignRow).toHaveAttribute(
				"data-session-openable",
				"false",
			);
			await expect(foreignRow.getByTestId("session-window-badge")).toContainText(
				`Window ${windowB}`,
			);
		} finally {
			await close();
			mock.server.close();
		}
	});
});