import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	domClickButton,
	domClickTestId,
	evalOnPanel,
	focusExtensionPage,
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

/**
 * Multi-window chrome-extension:// pages often freeze CDP on the unfocused
 * panel once a second extension document is open. Strategy:
 * 1) Finish all panel-A work while only A exists
 * 2) Open B and only CDP-touch B for B's run
 * 3) Reload A when we must re-enter A (session list) so CDP reconnects
 */
test.describe("two-window session isolation", () => {
	test("two windows keep independent chat sessions", async () => {
		test.setTimeout(300_000);
		const mock = startMockAnthropicServer({
			responses: [
				{
					chunks: [makeQuickChunk("Reply A")],
					delays: [0, 0, 0, 0],
					stopReason: "end_turn",
				},
				{
					chunks: [makeQuickChunk("Reply B")],
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
			expect(windowA).toBeGreaterThan(0);

			// --- All panel A work while it is the only extension page ---
			await configureMockProvider(panelA, mock.url);
			await typeTask(panelA, "task window A");
			// Icon-only button: aria-label "Run task", data-testid="run-button".
			await domClickTestId(panelA, "run-button");
			await expect
				.poll(
					async () =>
						evalOnPanel(panelA, () =>
							document.body.innerText.includes("Reply A"),
						),
					{ timeout: 60_000 },
				)
				.toBe(true);
			expect(mock.requestBodies.length).toBeGreaterThanOrEqual(1);

			// --- Open B; only CDP-touch B after this ---
			const { sidePanel: panelB, windowId: windowB } = await openSecondWindow(
				context,
				extensionId,
				panelA,
			);
			expect(windowB).toBeGreaterThan(0);
			expect(windowA).not.toBe(windowB);

			await configureMockProvider(panelB, mock.url);
			await focusExtensionPage(panelB);
			await typeTask(panelB, "task window B");
			await domClickTestId(panelB, "run-button");
			await expect
				.poll(
					async () =>
						evalOnPanel(panelB, () =>
							document.body.innerText.includes("Reply B"),
						),
					{ timeout: 60_000 },
				)
				.toBe(true);
			expect(mock.requestBodies.length).toBeGreaterThanOrEqual(2);

			// B must not show A's reply (single-page CDP — no freeze risk).
			const bHasA = await evalOnPanel(panelB, () =>
				document.body.innerText.includes("Reply A"),
			);
			expect(bHasA).toBe(false);

			// A already had Reply A before B opened; mock consumed two independent
			// requests. Avoid re-evaluating frozen panel A after dual-window open.
		} finally {
			await Promise.race([close(), new Promise((r) => setTimeout(r, 20_000))]);
			mock.server.close();
		}
	});

	test("session list in window A disables rows attached to window B", async () => {
		test.setTimeout(300_000);
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
			const windowA = await readPanelWindowId(panelA);
			// Pre-configure A while alone (settings are global / IDB-shared).
			await configureMockProvider(panelA, mock.url);

			const { sidePanel: panelB, windowId: windowB } = await openSecondWindow(
				context,
				extensionId,
				panelA,
			);
			expect(windowB).toBeGreaterThan(0);
			expect(windowA).not.toBe(windowB);

			// Only touch B for the agent run that creates B's session meta.
			await focusExtensionPage(panelB);
			// B may have timed out IDB → memory; re-apply provider on B so Run works.
			await configureMockProvider(panelB, mock.url);
			await typeTask(panelB, "only in B");
			await domClickTestId(panelB, "run-button");
			await expect
				.poll(
					async () =>
						evalOnPanel(panelB, () => {
							const el = document.querySelector(
								'[data-testid="chat-message-assistant"]',
							);
							return el?.textContent?.includes("B") ?? false;
						}),
					{ timeout: 60_000 },
				)
				.toBe(true);

			// Reconnect CDP to A via reload (frozen evaluate is common after B opens).
			await focusExtensionPage(panelA);
			await panelA.reload({ waitUntil: "domcontentloaded" });
			await panelA.waitForFunction(
				() => {
					const el = document.querySelector("[data-initialized]");
					return (
						el?.getAttribute("data-initialized") === "true" &&
						(el.getAttribute("data-worker-ready") === "true" ||
							el.getAttribute("data-boot-worker") === "ok")
					);
				},
				null,
				{ timeout: 90_000 },
			);

			await domClickButton(panelA, "More options");
			// Session list may need a moment after meta hydrate.
			const foreignState = await expect
				.poll(
					async () => {
						return panelA.evaluate((wid) => {
							const rows = [
								...document.querySelectorAll('[data-testid="session-item"]'),
							];
							const row = rows.find((r) => {
								const badge = r.querySelector(
									'[data-testid="session-window-badge"]',
								);
								return badge?.textContent?.includes(`Window ${wid}`);
							});
							return {
								found: !!row,
								openable: row?.getAttribute("data-session-openable") ?? null,
								badge:
									row?.querySelector('[data-testid="session-window-badge"]')
										?.textContent ?? null,
							};
						}, windowB);
					},
					{ timeout: 45_000 },
				)
				.toMatchObject({ found: true, openable: "false" })
				.then(async () =>
					panelA.evaluate((wid) => {
						const rows = [
							...document.querySelectorAll('[data-testid="session-item"]'),
						];
						const row = rows.find((r) => {
							const badge = r.querySelector(
								'[data-testid="session-window-badge"]',
							);
							return badge?.textContent?.includes(`Window ${wid}`);
						});
						return {
							found: !!row,
							openable: row?.getAttribute("data-session-openable") ?? null,
							badge:
								row?.querySelector('[data-testid="session-window-badge"]')
									?.textContent ?? null,
						};
					}, windowB),
				);

			expect(foreignState.found).toBe(true);
			expect(foreignState.openable).toBe("false");
			expect(foreignState.badge).toContain(`Window ${windowB}`);
		} finally {
			await Promise.race([close(), new Promise((r) => setTimeout(r, 20_000))]);
			mock.server.close();
		}
	});
});
