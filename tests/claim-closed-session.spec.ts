import { expect, test } from "@playwright/test";
import { finalTextTurn } from "./fixtures/mock-llm-turns";
import {
	broadcastWindowClose,
	clickRun,
	closeChromeWindow,
	configureMockProvider,
	domClickButton,
	launchExtension,
	openSecondWindow,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

async function runBThenClose(
	panelA: import("@playwright/test").Page,
	context: import("@playwright/test").BrowserContext,
	extensionId: string,
	mockUrl: string,
	assistantText: string,
	userText: string,
) {
	const { sidePanel: panelB, windowId: windowB } = await openSecondWindow(
		context,
		extensionId,
		panelA,
	);
	await configureMockProvider(panelB, mockUrl);
	await typeTask(panelB, userText);
	await clickRun(panelB);
	await expect(panelB.locator(`text=${assistantText}`)).toBeVisible({
		timeout: 15_000,
	});
	await expect(panelB.getByTestId("agent-status")).toContainText(/done/, {
		timeout: 15_000,
	});
	await panelA.bringToFront();
	await closeChromeWindow(context, windowB);
	return { windowB };
}

/**
 * C1 + R1: close lifecycle event marks claimable; claim same id + hydrate.
 */
test("claim closed session: Open in this window rebinds and hydrates chat", async () => {
	test.setTimeout(90_000);
	const mock = startMockAnthropicServer({
		responses: [finalTextTurn("msg-claim-b", "Content from window B")],
	});
	const {
		context,
		extensionId,
		sidePanel: panelA,
		close,
	} = await launchExtension();
	try {
		const { windowB } = await runBThenClose(
			panelA,
			context,
			extensionId,
			mock.url,
			"Content from window B",
			"message only on B",
		);
		// Explicit close lifecycle (no merge).
		await broadcastWindowClose(context, panelA, windowB);

		await domClickButton(panelA, "More options");
		const claimable = panelA.locator(
			'[data-testid="session-item"][data-session-claimable="true"]',
		);
		await expect
			.poll(async () => claimable.count(), { timeout: 25_000 })
			.toBeGreaterThan(0);

		await claimable.first().getByTestId("claim-closed-session").click();

		await expect(
			panelA
				.locator('[data-testid="chat-message-user"]')
				.filter({ hasText: "message only on B" })
				.first(),
		).toBeVisible({ timeout: 15_000 });
		await expect(
			panelA
				.locator('[data-testid="chat-message-assistant"]')
				.filter({ hasText: "Content from window B" })
				.first(),
		).toBeVisible({ timeout: 15_000 });

		// After claim, no closed/orphan rows remain claimable on A.
		await domClickButton(panelA, "More options");
		await expect
			.poll(
				async () =>
					panelA
						.locator(
							'[data-testid="session-item"][data-session-claimable="true"]',
						)
						.count(),
				{ timeout: 10_000 },
			)
			.toBe(0);
	} finally {
		await close();
		mock.server.close();
	}
});

/**
 * Orphan path: only Chrome window gone — no broadcastWindowClose.
 * Relies on chrome.windows.getAll live set (real merge/close event gap).
 */
test("claim orphan session without close event uses live window set", async () => {
	test.setTimeout(90_000);
	const mock = startMockAnthropicServer({
		responses: [finalTextTurn("msg-orphan-b", "Orphan content from B")],
	});
	const {
		context,
		extensionId,
		sidePanel: panelA,
		close,
	} = await launchExtension();
	try {
		await runBThenClose(
			panelA,
			context,
			extensionId,
			mock.url,
			"Orphan content from B",
			"orphan user on B",
		);
		// Intentionally no broadcastWindowClose.

		await domClickButton(panelA, "More options");
		const claimable = panelA.locator(
			'[data-testid="session-item"][data-session-claimable="true"]',
		);
		await expect
			.poll(
				async () => {
					const n = await claimable.count();
					if (n === 0) {
						await panelA.keyboard.press("Escape").catch(() => {});
						await domClickButton(panelA, "More options");
					}
					return n;
				},
				{ timeout: 25_000 },
			)
			.toBeGreaterThan(0);

		await claimable.first().getByTestId("claim-closed-session").click();
		await expect(
			panelA
				.locator('[data-testid="chat-message-assistant"]')
				.filter({ hasText: "Orphan content from B" })
				.first(),
		).toBeVisible({ timeout: 15_000 });
	} finally {
		await close();
		mock.server.close();
	}
});
