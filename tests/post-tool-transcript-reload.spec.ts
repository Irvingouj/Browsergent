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
 * Product contract: after tool-only → final answer, reloading the sidepanel
 * document rehydrates user + final assistant text from durable storage.
 *
 * Uses same browser context + page reload (same windowId). Full process
 * relaunch can bind a new windowId and open a fresh empty session — that is
 * a multi-window attach concern, not transcript durability.
 */
test("reload preserves user + final assistant after tool-only run", async () => {
	test.setTimeout(90_000);

	const finalAnswer = "Persisted final answer after tool.";
	const userTask = "how many tabs persist test";
	const mock = startMockAnthropicServer({
		responses: [
			toolOnlyRunJsTurn("toolu_reload_1", DEFAULT_TAB_LIST_CODE),
			finalTextTurn("msg-reload-final", finalAnswer),
		],
	});

	const { sidePanel, close } = await launchExtension();
	try {
		await configureMockProvider(sidePanel, mock.url);
		await typeTask(sidePanel, userTask);
		await clickRun(sidePanel);

		await expect(
			sidePanel
				.locator('[data-testid="chat-message-assistant"]')
				.filter({ hasText: finalAnswer }),
		).toBeVisible({ timeout: 30_000 });
		await expect(sidePanel.getByTestId("agent-status")).toHaveText(/done/i, {
			timeout: 20_000,
		});

		// Allow debounced session save to flush to IndexedDB.
		await sidePanel.waitForTimeout(800);

		await sidePanel.reload({ waitUntil: "domcontentloaded" });
		await sidePanel.waitForFunction(
			() => {
				const el = document.querySelector("[data-initialized]");
				return el?.getAttribute("data-initialized") === "true";
			},
			null,
			{ timeout: 30_000 },
		);

		await expect(
			sidePanel
				.locator('[data-testid="chat-message-user"]')
				.filter({ hasText: userTask }),
		).toBeVisible({ timeout: 30_000 });
		await expect(
			sidePanel
				.locator('[data-testid="chat-message-assistant"]')
				.filter({ hasText: finalAnswer }),
		).toBeVisible({ timeout: 30_000 });
	} finally {
		await close();
		mock.server.close();
	}
});
