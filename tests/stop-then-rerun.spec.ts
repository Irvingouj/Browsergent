import { expect, test } from "@playwright/test";
import { finalTextTurn, slowFinalTextTurn } from "./fixtures/mock-llm-turns";
import {
	clickRun,
	configureMockProvider,
	launchExtension,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

/**
 * P0: Stop mid-run must leave a terminal status, then a second Run must
 * produce a new visible assistant answer (not stuck calling_model).
 */
test("stop during stream then re-run produces a new final answer", async () => {
	test.setTimeout(90_000);

	const mock = startMockAnthropicServer({
		responses: [
			slowFinalTextTurn("msg-slow", "This should be interrupted.", 10_000),
			finalTextTurn("msg-second", "Second run ok."),
		],
	});

	const { sidePanel, close } = await launchExtension();
	try {
		await configureMockProvider(sidePanel, mock.url);

		await typeTask(sidePanel, "slow task");
		await clickRun(sidePanel);

		// Stop while the long delay is in flight.
		await expect(
			sidePanel.getByRole("button", { name: "Stop agent" }),
		).toBeVisible({ timeout: 10_000 });
		await sidePanel.getByRole("button", { name: "Stop agent" }).click();

		await expect(sidePanel.getByTestId("agent-status")).toHaveText(/stopped/i, {
			timeout: 15_000,
		});

		// Second run after stop.
		await typeTask(sidePanel, "second task");
		await clickRun(sidePanel);

		await expect(
			sidePanel
				.locator('[data-testid="chat-message-assistant"]')
				.filter({ hasText: "Second run ok." }),
		).toBeVisible({ timeout: 20_000 });

		await expect(sidePanel.getByTestId("agent-status")).toHaveText(/done/i, {
			timeout: 20_000,
		});

		await expect(sidePanel.locator("text=second task")).toBeVisible();
	} finally {
		await close();
		mock.server.close();
	}
});
