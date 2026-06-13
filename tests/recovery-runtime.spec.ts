import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	launchExtension,
	startMockAnthropicServer,
} from "./helpers";

// Mock responses are incomplete; skip until runtime recovery scenarios are wired.

test.skip("tool timeout — runtime rebuilds and next call succeeds", async () => {
	const mock = startMockAnthropicServer({
		responses: [],
	});
	const { sidePanel, close } = await launchExtension();
	await configureMockProvider(sidePanel, mock.url, "fake-key");

	await sidePanel
		.locator('[data-testid="task-input"]')
		.fill("slow tool");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	await expect(sidePanel.locator("text=run_js")).toHaveCount(2, {
		timeout: 15000,
	});

	await close();
	mock.server.close();
});

test.skip("runtime corrupted — session rebuilds and health check passes", async () => {
	const mock = startMockAnthropicServer({
		responses: [],
	});
	const { sidePanel, close } = await launchExtension();
	await configureMockProvider(sidePanel, mock.url, "fake-key");

	await sidePanel
		.locator('[data-testid="task-input"]')
		.fill("crash runtime");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	await expect(sidePanel.locator("text=run_js")).toHaveCount(1, {
		timeout: 15000,
	});

	await close();
	mock.server.close();
});
