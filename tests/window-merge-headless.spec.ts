import { expect, test } from "@playwright/test";
import {
	broadcastWindowMerge,
	closeChromeWindow,
	configureMockProvider,
	launchExtension,
	openSecondWindow,
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

test.describe("merge during headless run", () => {
	test("B7: merged session rebinds onto survivor and run completes after merge", async () => {
		test.setTimeout(90_000);
		const mock = startMockAnthropicServer({
			responses: [
				{
					chunks: [makeQuickChunk()],
					delays: [0, 0, 0, 0],
					stopReason: "end_turn",
				},
				{
					chunks: [makeSlowChunk(), makeQuickChunk("Headless merge done")],
					delays: [3000, 0, 0, 0],
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

			await typeTask(panelB, "warmup");
			await panelB.getByRole("button", { name: "Run task" }).click();
			await expect(
				panelB.locator('[data-testid="chat-message-assistant"]'),
			).toContainText("Done", { timeout: 10000 });

			await typeTask(panelB, "slow headless merge");
			await panelB.getByRole("button", { name: "Run task" }).click();
			await expect(panelB.getByTestId("agent-status")).not.toHaveText(
				/^(idle|done|stopped)$/,
				{ timeout: 5000 },
			);

			const mergedSessionId = await panelB.evaluate(async () => {
				const db = await new Promise<IDBDatabase>((resolve, reject) => {
					const req = indexedDB.open("browsergent", 2);
					req.onsuccess = () => resolve(req.result);
					req.onerror = () => reject(req.error);
				});
				const meta = await new Promise<{
					panelActiveSession?: Record<string, string>;
				} | null>((resolve, reject) => {
					const tx = db.transaction("sessions", "readonly");
					const req = tx.objectStore("sessions").get("__meta");
					req.onsuccess = () =>
						resolve(
							req.result as {
								panelActiveSession?: Record<string, string>;
							} | null,
						);
					req.onerror = () => reject(req.error);
				});
				db.close();
				const wid = document
					.querySelector('[data-initialized="true"]')
					?.getAttribute("data-window-id");
				return meta?.panelActiveSession?.[wid ?? ""] ?? null;
			});

			await panelA.bringToFront();
			await broadcastWindowMerge(context, panelA, windowB, windowA, {
				reboundRunningSessionIds: mergedSessionId ? [mergedSessionId] : [],
			});

			await expect(
				panelB.locator('[data-testid="chat-message-assistant"]').last(),
			).toContainText("Headless merge done", { timeout: 20000 });

			expect(mergedSessionId).toBeTruthy();

			await panelA.getByRole("button", { name: "More options" }).click();
			const mergedRow = panelA.locator(
				`[data-testid="session-item"][data-session-id="${mergedSessionId}"]`,
			);
			await expect
				.poll(async () => mergedRow.getAttribute("data-session-openable"), {
					timeout: 15000,
				})
				.toBe("true");
			await expect(mergedRow).toHaveCount(1);
			await expect(mergedRow.getByTestId("session-window-badge")).toContainText(
				`Window ${windowA}`,
			);

			await mergedRow.click();
			await expect(
				panelA.locator('[data-testid="chat-message-assistant"]').last(),
			).toContainText("Headless merge done", { timeout: 10000 });

			await closeChromeWindow(context, windowB);
		} finally {
			await close();
			mock.server.close();
		}
	});
});
