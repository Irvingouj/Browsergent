import { expect, test } from "@playwright/test";
import {
	DEFAULT_TAB_LIST_CODE,
	finalTextTurn,
	toolOnlyRunJsTurn,
} from "./fixtures/mock-llm-turns";
import {
	clickRun,
	configureMockProvider,
	launchExtension,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

/**
 * P0 regression gate (user-visible):
 *
 * After a tool-only first turn (no assistant text before the tool), the panel
 * must show the final assistant message after the tool completes — not get
 * stuck on waiting_for_model / CALLING MODEL with only a run_js row.
 */
test("tool-only run_js then final assistant text appears in chat", async () => {
	test.setTimeout(60_000);

	const finalAnswer = "I see 3 open tabs.";
	const mock = startMockAnthropicServer({
		responses: [
			toolOnlyRunJsTurn("toolu_tabs_1", DEFAULT_TAB_LIST_CODE),
			finalTextTurn("msg-final-answer", finalAnswer),
		],
	});

	const { sidePanel, close } = await launchExtension();
	try {
		await configureMockProvider(sidePanel, mock.url);

		await typeTask(sidePanel, "how many tabs do you see");
		await clickRun(sidePanel);

		await expect(
			sidePanel
				.locator('[data-testid="trace-entry"]')
				.filter({ hasText: "run_js" }),
		).toBeVisible({ timeout: 20_000 });

		const finalBubble = sidePanel
			.locator('[data-testid="chat-message-assistant"]')
			.filter({ hasText: finalAnswer });
		await expect(finalBubble).toBeVisible({ timeout: 20_000 });

		await expect(sidePanel.getByTestId("agent-status")).toHaveText(/done/i, {
			timeout: 20_000,
		});

		expect(mock.requestBodies.length).toBeGreaterThanOrEqual(2);
	} finally {
		await close();
		mock.server.close();
	}
});

test("two tool-only run_js turns then final assistant text", async () => {
	test.setTimeout(60_000);

	const finalAnswer = "I see 3 open tabs after two tools.";
	const mock = startMockAnthropicServer({
		responses: [
			toolOnlyRunJsTurn("toolu_m1", DEFAULT_TAB_LIST_CODE, "msg-m1"),
			toolOnlyRunJsTurn("toolu_m2", DEFAULT_TAB_LIST_CODE, "msg-m2"),
			finalTextTurn("msg-m-final", finalAnswer),
		],
	});

	const { sidePanel, close } = await launchExtension();
	try {
		await configureMockProvider(sidePanel, mock.url);

		await typeTask(sidePanel, "list tabs twice then answer");
		await clickRun(sidePanel);

		await expect
			.poll(
				async () =>
					sidePanel
						.locator('[data-testid="trace-entry"]')
						.filter({
							hasText: "run_js",
						})
						.count(),
				{ timeout: 30_000 },
			)
			.toBeGreaterThanOrEqual(2);

		await expect(
			sidePanel
				.locator('[data-testid="chat-message-assistant"]')
				.filter({ hasText: finalAnswer }),
		).toBeVisible({ timeout: 20_000 });

		await expect(sidePanel.getByTestId("agent-status")).toHaveText(/done/i, {
			timeout: 20_000,
		});
		expect(mock.requestBodies.length).toBeGreaterThanOrEqual(3);
	} finally {
		await close();
		mock.server.close();
	}
});
