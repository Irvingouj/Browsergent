import { expect, test } from "@playwright/test";
import {
	broadcastWindowClose,
	broadcastWindowMerge,
	clickRun,
	closeChromeWindow,
	configureMockProvider,
	domClickButton,
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

test.describe("window lifecycle", () => {
	test("clicking foreign-window session row shows English block message", async () => {
		const mock = startMockAnthropicServer({
			responses: [
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
			const { sidePanel: panelB, windowId: windowB } = await openSecondWindow(
				context,
				extensionId,
				panelA,
			);
			await configureMockProvider(panelA, mock.url);
			await configureMockProvider(panelB, mock.url);

			await typeTask(panelB, "only in B");
			await clickRun(panelB);
			await expect(
				panelB.locator('[data-testid="chat-message-assistant"]'),
			).toContainText("B", { timeout: 10000 });
			// Wait for terminal status so SessionRunSink has flushed B's body to IDB.
			await expect(panelB.getByTestId("agent-status")).toContainText(/done/, {
				timeout: 15_000,
			});

			await panelA.bringToFront();
			await domClickButton(panelA, "More options");
			const foreignRow = panelA.locator(
				`[data-testid="session-item"]:has([data-testid="session-window-badge"]:text-is("Window ${windowB}"))`,
			);
			// B must have flushed its session body to shared IDB before A can list it.
			await expect(foreignRow).toBeVisible({ timeout: 20_000 });
			await expect(foreignRow).toHaveAttribute(
				"data-session-openable",
				"false",
			);
			await foreignRow.click();
			await expect(
				panelA.locator("text=This session belongs to another window"),
			).toBeVisible({ timeout: 5000 });
			// Session list title may still show "only in B"; chat must not hydrate it.
			const chatUserCount = await panelA
				.locator('[data-testid="chat-message-user"]')
				.filter({ hasText: "only in B" })
				.count();
			expect(chatUserCount).toBe(0);
		} finally {
			await close();
			mock.server.close();
		}
	});

	test("merge rebinds removed window session onto survivor as openable", async () => {
		test.setTimeout(60_000);
		const mock = startMockAnthropicServer({
			responses: [
				{
					chunks: [makeQuickChunk("Merged content")],
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

			await typeTask(panelB, "session to merge");
			await clickRun(panelB);
			await expect(panelB.locator("text=Merged content")).toBeVisible({
				timeout: 10000,
			});
			// Ensure SessionRunSink flushed body+meta before we close B.
			await expect(panelB.getByTestId("agent-status")).toContainText(/done/, {
				timeout: 15_000,
			});

			await panelA.bringToFront();
			await closeChromeWindow(context, windowB);
			await broadcastWindowMerge(context, panelA, windowB, windowA);

			// Force list refresh after merge event (toggle drawer).
			await domClickButton(panelA, "More options");
			await expect(panelA.locator('[data-testid="session-item"]').first())
				.toBeVisible({ timeout: 10_000 })
				.catch(() => {});
			await panelA.keyboard.press("Escape").catch(() => {});
			await domClickButton(panelA, "More options");

			// After merge, B's session should be openable on window A.
			// Poll until any openable non-empty row appears for window A.
			const openableOnA = panelA.locator(
				`[data-testid="session-item"][data-session-openable="true"]:has([data-testid="session-window-badge"]:text-is("Window ${windowA}"))`,
			);
			await expect
				.poll(
					async () => {
						const n = await openableOnA.count();
						if (n === 0) {
							await panelA.keyboard.press("Escape").catch(() => {});
							await domClickButton(panelA, "More options");
							return 0;
						}
						// Prefer a row with messages if present.
						const withMsgs = openableOnA.filter({
							hasText: /[1-9]\d* messages/,
						});
						return (await withMsgs.count()) > 0 ? withMsgs.count() : n;
					},
					{ timeout: 25_000 },
				)
				.toBeGreaterThan(0);

			const mergedRow = openableOnA
				.filter({ hasText: /[1-9]\d* messages/ })
				.or(openableOnA)
				.first();
			const mergedSessionId = await mergedRow.getAttribute("data-session-id");
			expect(mergedSessionId).toBeTruthy();
			await panelA.evaluate((id) => {
				const el = document.querySelector(
					`[data-testid="session-item"][data-session-id="${id}"]`,
				) as HTMLElement | null;
				el?.click();
			}, mergedSessionId);

			// Hydrate chat from the rebound session (may be empty if B never flushed —
			// still require openable=true which we already asserted by selecting the row).
			await expect
				.poll(
					async () => {
						const users = await panelA
							.locator('[data-testid="chat-message-user"]')
							.count();
						const assistants = await panelA
							.locator('[data-testid="chat-message-assistant"]')
							.count();
						return users + assistants;
					},
					{ timeout: 15_000 },
				)
				.toBeGreaterThan(0);
			await expect(
				panelA.locator(
					'[data-testid="session-window-badge"]:text-matches("\\(closed\\)")',
				),
			).toHaveCount(0);
		} finally {
			await close();
			mock.server.close();
		}
	});

	test("bare window close marks sessions closed without rebind", async () => {
		const mock = startMockAnthropicServer({
			responses: [
				{
					chunks: [makeQuickChunk("Closed window content")],
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
			const { sidePanel: panelB, windowId: windowB } = await openSecondWindow(
				context,
				extensionId,
				panelA,
			);
			await configureMockProvider(panelA, mock.url);
			await configureMockProvider(panelB, mock.url);

			await typeTask(panelB, "session in closed window");
			await clickRun(panelB);
			await expect(panelB.locator("text=Closed window content")).toBeVisible({
				timeout: 10000,
			});
			await expect(panelB.getByTestId("agent-status")).toContainText(/done/, {
				timeout: 15_000,
			});

			await panelA.bringToFront();
			await closeChromeWindow(context, windowB);
			await broadcastWindowClose(context, panelA, windowB);

			await domClickButton(panelA, "More options");
			const closedRow = panelA.locator(
				`[data-testid="session-item"]:has([data-testid="session-window-badge"]:text-is("Window ${windowB} (closed)"))`,
			);
			await expect(closedRow).toBeVisible({ timeout: 15_000 });
			await expect(closedRow).toHaveAttribute("data-session-openable", "false");
		} finally {
			await close();
			mock.server.close();
		}
	});

	test("foreign row shows running badge when agent runs in another window", async () => {
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
		const {
			context,
			extensionId,
			sidePanel: panelA,
			close,
		} = await launchExtension();
		try {
			const { sidePanel: panelB, windowId: windowB } = await openSecondWindow(
				context,
				extensionId,
				panelA,
			);
			await configureMockProvider(panelA, mock.url);
			await configureMockProvider(panelB, mock.url);

			await typeTask(panelB, "warmup in B");
			await panelB.getByRole("button", { name: "Run task" }).click();
			await expect(
				panelB.locator('[data-testid="chat-message-assistant"]'),
			).toContainText("B warmup", { timeout: 10000 });

			await typeTask(panelB, "slow run in B");
			await panelB.getByRole("button", { name: "Run task" }).click();
			await expect(panelB.getByTestId("agent-status")).not.toHaveText(
				/^(idle|done|stopped)$/,
				{ timeout: 5000 },
			);
			await expect
				.poll(
					async () =>
						panelA.evaluate(async () => {
							const db = await new Promise<IDBDatabase>((resolve, reject) => {
								const req = indexedDB.open("browsergent", 2);
								req.onsuccess = () => resolve(req.result);
								req.onerror = () => reject(req.error);
							});
							const meta = await new Promise<{
								runningSessionsByWindow?: Record<string, string[]>;
							} | null>((resolve, reject) => {
								const tx = db.transaction("sessions", "readonly");
								const req = tx.objectStore("sessions").get("__meta");
								req.onsuccess = () =>
									resolve(
										req.result as {
											runningSessionsByWindow?: Record<string, string[]>;
										} | null,
									);
								req.onerror = () => reject(req.error);
							});
							db.close();
							const byWindow = meta?.runningSessionsByWindow ?? {};
							return Object.values(byWindow).flat().length;
						}),
					{ timeout: 10000 },
				)
				.toBeGreaterThan(0);

			await panelA.getByRole("button", { name: "More options" }).click();
			const foreignRow = panelA.locator(
				`[data-testid="session-item"]:has([data-testid="session-window-badge"]:text-is("Window ${windowB}"))`,
			);
			await expect(foreignRow).toBeVisible({ timeout: 5000 });
			await expect(foreignRow.getByTestId("session-running-badge")).toBeVisible(
				{ timeout: 10000 },
			);
			await expect(foreignRow).toHaveAttribute(
				"data-session-openable",
				"false",
			);
		} finally {
			await close();
			mock.server.close();
		}
	});
});
