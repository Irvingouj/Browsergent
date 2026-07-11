import { expect, test } from "@playwright/test";
import {
	DEFAULT_TAB_LIST_CODE,
	finalTextTurn,
	slowFinalTextTurn,
	toolOnlyRunJsTurn,
} from "./fixtures/mock-llm-turns";
import {
	clickRun,
	configureMockProvider,
	evalOnPanel,
	focusExtensionPage,
	launchExtension,
	openSecondWindow,
	readPanelWindowId,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

/**
 * P0 multi-window agent visibility: window B must complete tool→final text
 * without polluting window A, and Stop on B must work.
 */
test.describe("second window agent run", () => {
	test("window B tool-only then final text; A chat not polluted", async () => {
		test.setTimeout(180_000);

		const finalB = "Window B final answer after tool.";
		const mock = startMockAnthropicServer({
			responses: [
				// Optional A text-only if we run A first — keep one slot unused-safe.
				finalTextTurn("msg-a", "Window A quiet reply."),
				toolOnlyRunJsTurn("toolu_b1", DEFAULT_TAB_LIST_CODE, "msg-b-tool"),
				finalTextTurn("msg-b-final", finalB),
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

			await configureMockProvider(panelA, mock.url);
			await typeTask(panelA, "task A only");
			await clickRun(panelA);
			await expect
				.poll(
					async () =>
						evalOnPanel(panelA, () =>
							document.body.innerText.includes("Window A quiet reply."),
						),
					{ timeout: 60_000 },
				)
				.toBe(true);

			const { sidePanel: panelB, windowId: windowB } = await openSecondWindow(
				context,
				extensionId,
				panelA,
			);
			expect(windowB).toBeGreaterThan(0);
			expect(windowB).not.toBe(windowA);

			await configureMockProvider(panelB, mock.url);
			await focusExtensionPage(panelB);
			await typeTask(panelB, "how many tabs in B");
			await clickRun(panelB);

			await expect
				.poll(
					async () =>
						evalOnPanel(panelB, () =>
							document.body.innerText.includes(
								"Window B final answer after tool.",
							),
						),
					{ timeout: 90_000 },
				)
				.toBe(true);

			await expect(panelB.getByTestId("agent-status")).toHaveText(/done/i, {
				timeout: 30_000,
			});

			// A must not show B's final answer (reload A if CDP is stale).
			await focusExtensionPage(panelA);
			await panelA.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
			await panelA.waitForFunction(
				() =>
					document
						.querySelector("[data-initialized]")
						?.getAttribute("data-initialized") === "true",
				null,
				{ timeout: 30_000 },
			);
			const aHasB = await evalOnPanel(panelA, () =>
				document.body.innerText.includes("Window B final answer after tool."),
			);
			expect(aHasB).toBe(false);
		} finally {
			await close();
			mock.server.close();
		}
	});

	test("window B stop during slow stream", async () => {
		test.setTimeout(180_000);

		const mock = startMockAnthropicServer({
			responses: [
				finalTextTurn("msg-a2", "A stays fine."),
				slowFinalTextTurn("msg-b-slow", "B interrupted body.", 12_000),
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
			await typeTask(panelA, "task A");
			await clickRun(panelA);
			await expect
				.poll(
					async () =>
						evalOnPanel(panelA, () =>
							document.body.innerText.includes("A stays fine."),
						),
					{ timeout: 60_000 },
				)
				.toBe(true);

			const { sidePanel: panelB } = await openSecondWindow(
				context,
				extensionId,
				panelA,
			);
			await configureMockProvider(panelB, mock.url);
			await focusExtensionPage(panelB);
			await typeTask(panelB, "slow in B");
			await clickRun(panelB);

			await expect(
				panelB.getByRole("button", { name: "Stop agent" }),
			).toBeVisible({ timeout: 15_000 });
			await panelB.getByRole("button", { name: "Stop agent" }).click();

			await expect(panelB.getByTestId("agent-status")).toHaveText(/stopped/i, {
				timeout: 20_000,
			});
		} finally {
			await close();
			mock.server.close();
		}
	});
});
