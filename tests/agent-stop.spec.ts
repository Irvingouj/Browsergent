import { expect, test } from "@playwright/test";
import { slowFinalTextTurn } from "./fixtures/mock-llm-turns";
import {
	clickRun,
	configureMockProvider,
	launchExtension,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

test("status shows idle initially", async () => {
	const { sidePanel, close } = await launchExtension();
	await expect(sidePanel.locator("text=idle")).toBeVisible();
	await close();
});

test("stop button appears while running and stop reaches terminal status", async () => {
	test.setTimeout(60_000);
	const mock = startMockAnthropicServer({
		responses: [slowFinalTextTurn("msg-stop-smoke", "interrupted body", 8_000)],
	});
	const { sidePanel, close } = await launchExtension();
	try {
		await configureMockProvider(sidePanel, mock.url);
		await typeTask(sidePanel, "stop smoke");
		await clickRun(sidePanel);

		await expect(
			sidePanel.getByRole("button", { name: "Stop agent" }),
		).toBeVisible({ timeout: 10_000 });
		await sidePanel.getByRole("button", { name: "Stop agent" }).click();

		await expect(sidePanel.getByTestId("agent-status")).toHaveText(/stopped/i, {
			timeout: 15_000,
		});
	} finally {
		await close();
		mock.server.close();
	}
});
