import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	launchExtension,
	startMockAnthropicServer,
} from "./helpers";

// Mock responses are incomplete; skip until multi-turn recovery scenarios are wired.

test.skip("tool stale ref — retry after fresh snapshot", async () => {
	const mock = startMockAnthropicServer({
		responses: [],
	});
	const { sidePanel, close } = await launchExtension();
	await configureMockProvider(sidePanel, mock.url, "fake-key");

	await sidePanel.locator('[data-testid="task-input"]').fill("click stale");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	await expect(sidePanel.locator("text=run_js")).toHaveCount(4, {
		timeout: 15000,
	});

	await close();
	mock.server.close();
});
