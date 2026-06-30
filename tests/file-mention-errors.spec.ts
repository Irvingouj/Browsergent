import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	launchExtension,
	startSimpleMockProvider,
	typeTask,
} from "./helpers";

test("missing file mention shows system error and does not call provider", async () => {
	test.setTimeout(60000);
	const mock = startSimpleMockProvider();
	const { sidePanel, close } = await launchExtension();

	await configureMockProvider(sidePanel, mock.url);
	await typeTask(sidePanel, "Check @[file:nonexistent-id:missing.txt] please");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	await expect(
		sidePanel.locator('[data-testid="chat-message-system"]'),
	).toContainText("File attachment failed", { timeout: 10000 });
	await expect(
		sidePanel.locator('[data-testid="chat-message-system"]'),
	).toContainText("File not found: nonexistent-id");

	expect(mock.requestBodies.length).toBe(0);

	await close();
	mock.server.close();
});
