import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	extractFirstUserMessageText,
	launchExtension,
	startSimpleMockProvider,
	uploadFileViaPanel,
} from "./helpers";

const FILE_CONTENT = "Attachment inject test content";

test("file mention injects attachment block into first provider request", async () => {
	test.setTimeout(90000);
	const mock = startSimpleMockProvider();
	const { sidePanel, close } = await launchExtension();

	await configureMockProvider(sidePanel, mock.url);

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.getByTestId("files-panel")).toBeVisible({
		timeout: 10000,
	});
	await uploadFileViaPanel(
		sidePanel,
		"notes.txt",
		FILE_CONTENT,
		"text/plain",
	);
	await expect(sidePanel.locator("text=notes.txt")).toBeVisible({
		timeout: 10000,
	});

	await sidePanel.getByRole("button", { name: "Chat" }).click();
	const taskInput = sidePanel.locator('input[data-testid="task-input"]');
	await taskInput.click();
	await taskInput.fill("@");
	await expect(sidePanel.getByTestId("command-picker")).toBeVisible({
		timeout: 5000,
	});
	await sidePanel.getByTestId(/^command-picker-item-/).first().click();
	await taskInput.pressSequentially(" summarize this file");

	await sidePanel.getByRole("button", { name: "Run task" }).click();
	await expect(sidePanel.getByTestId("agent-status")).toHaveText("done", {
		timeout: 30000,
	});

	expect(mock.requestBodies.length).toBeGreaterThanOrEqual(1);
	const textContent = extractFirstUserMessageText(mock.requestBodies[0]);
	expect(textContent).toContain("<attachment");
	expect(textContent).toContain('name="notes.txt"');
	expect(textContent).toContain(FILE_CONTENT);

	await close();
	mock.server.close();
});
