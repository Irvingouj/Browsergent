import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	extractFirstUserMessageText,
	launchExtension,
	readTaskInput,
	startMockAnthropicServer,
} from "./helpers";

const MSG_START = (id: string) =>
	`event: message_start\ndata: ${JSON.stringify({
		type: "message_start",
		message: {
			id,
			type: "message",
			role: "assistant",
			content: [],
			model: "test",
			stop_reason: null,
			usage: { input_tokens: 10, output_tokens: 0 },
		},
	})}\n\n`;

const BLOCK_STOP = `event: content_block_stop\ndata: ${JSON.stringify({
	type: "content_block_stop",
	index: 0,
})}\n\n`;

function textChunk(index: number, text: string): string {
	return [
		`event: content_block_start\ndata: ${JSON.stringify({
			type: "content_block_start",
			index,
			content_block: { type: "text", text: "" },
		})}\n\n`,
		`event: content_block_delta\ndata: ${JSON.stringify({
			type: "content_block_delta",
			index,
			delta: { type: "text_delta", text },
		})}\n\n`,
		`event: content_block_stop\ndata: ${JSON.stringify({
			type: "content_block_stop",
			index,
		})}\n\n`,
	].join("");
}

test("typing @ shows open http tabs in the picker", async () => {
	test.setTimeout(90000);
	const { context, sidePanel, close } = await launchExtension();

	const pageA = await context.newPage();
	await pageA.route("**/*", (route) => {
		route.fulfill({
			status: 200,
			contentType: "text/html",
			body: "<html><head><title>Page A</title></head><body>Content A</body></html>",
		});
	});
	await pageA.goto("https://page-a.test/");
	await pageA.waitForFunction('document.title === "Page A"');

	const pageB = await context.newPage();
	await pageB.route("**/*", (route) => {
		route.fulfill({
			status: 200,
			contentType: "text/html",
			body: "<html><head><title>Page B</title></head><body>Content B</body></html>",
		});
	});
	await pageB.goto("https://page-b.test/");
	await pageB.waitForFunction('document.title === "Page B"');

	await sidePanel.bringToFront();
	const taskInput = sidePanel.locator('[data-testid="task-input"]');
	await taskInput.click();
	await taskInput.fill("@");

	await expect(sidePanel.getByTestId("command-picker")).toBeVisible({
		timeout: 5000,
	});

	const pickerText = await sidePanel
		.getByTestId("command-picker")
		.textContent();
	expect(pickerText).toContain("Page A");
	expect(pickerText).toContain("Page B");

	await close();
});

test("selecting a tab inserts the @[tab:...] token", async () => {
	test.setTimeout(90000);
	const { context, sidePanel, close } = await launchExtension();

	const pageA = await context.newPage();
	await pageA.route("**/*", (route) => {
		route.fulfill({
			status: 200,
			contentType: "text/html",
			body: "<html><head><title>Page A</title></head><body>Content A</body></html>",
		});
	});
	await pageA.goto("https://page-a.test/");
	await pageA.waitForFunction('document.title === "Page A"');

	await sidePanel.bringToFront();
	const taskInput = sidePanel.locator('[data-testid="task-input"]');
	await taskInput.click();
	await taskInput.fill("@");

	await expect(sidePanel.getByTestId("command-picker")).toBeVisible({
		timeout: 5000,
	});

	await sidePanel
		.getByTestId(/^command-picker-item-/)
		.first()
		.click();

	const value = await readTaskInput(sidePanel);
	expect(value).toContain("@[tab:");
	expect(value).toContain("Page A");

	await close();
});

test("run with a tab mention injects <tab .../> XML into the model request", async () => {
	test.setTimeout(90000);
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [MSG_START("msg-1"), textChunk(0, "Done."), BLOCK_STOP],
				delays: [0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});
	const { context, sidePanel, close } = await launchExtension();
	await configureMockProvider(sidePanel, mock.url);

	const targetPage = await context.newPage();
	await targetPage.route("**/*", (route) => {
		route.fulfill({
			status: 200,
			contentType: "text/html",
			body: "<html><head><title>Target Page</title></head><body>Hello</body></html>",
		});
	});
	await targetPage.goto("https://target-page.test/");
	await targetPage.waitForFunction('document.title === "Target Page"');

	await sidePanel.bringToFront();
	const taskInput = sidePanel.locator('[data-testid="task-input"]');
	await taskInput.click();
	await taskInput.fill("@");

	await expect(sidePanel.getByTestId("command-picker")).toBeVisible({
		timeout: 5000,
	});
	await sidePanel
		.getByTestId(/^command-picker-item-/)
		.first()
		.click();
	// Wait for the tab-mention chip to render in the contentEditable before
	// typing more text — the picker click dispatches setTaskDraft and ChipInput
	// reconciles async; typing into the stale DOM would overwrite the token.
	await expect(sidePanel.locator('[data-testid="task-input"]')).toContainText(
		"Target Page",
		{ timeout: 5000 },
	);
	await taskInput.pressSequentially(" describe this tab");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	await expect(sidePanel.getByTestId("agent-status")).toHaveText("done", {
		timeout: 30000,
	});

	expect(mock.requestBodies.length).toBeGreaterThanOrEqual(1);
	const userText = extractFirstUserMessageText(mock.requestBodies[0]);
	expect(userText).toContain("<tab tabId=");
	expect(userText).toContain("url=");
	expect(userText).toContain("title=");
	expect(userText).toContain("Target Page");

	await close();
	mock.server.close();
});

test("chrome:// and chrome-extension:// tabs do not appear in the picker", async () => {
	test.setTimeout(90000);
	const { sidePanel, close } = await launchExtension();

	const taskInput = sidePanel.locator('[data-testid="task-input"]');
	await taskInput.click();
	await taskInput.fill("@");

	// Wait for either the item picker or the empty picker to appear
	const pickerContainer = sidePanel.locator(
		'[data-testid="command-picker"], [data-testid="command-picker-empty"]',
	);
	await pickerContainer.first().waitFor({ state: "visible", timeout: 5000 });

	const allText = await pickerContainer.first().textContent();
	expect(allText ?? "").not.toContain("chrome-extension://");
	expect(allText ?? "").not.toContain("chrome://");

	await close();
});

test("non-existent tabId produces a clear error, not silent failure", async () => {
	test.setTimeout(90000);
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [MSG_START("msg-1"), textChunk(0, "Done."), BLOCK_STOP],
				delays: [0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});
	const { sidePanel, close } = await launchExtension();
	await configureMockProvider(sidePanel, mock.url);

	await sidePanel
		.locator('[data-testid="task-input"]')
		.fill("do something @[tab:999:ghost]");

	await sidePanel.getByRole("button", { name: "Run task" }).click();

	await expect(
		sidePanel.locator('[data-testid="chat-message-system"]'),
	).toContainText("Tab reference failed", { timeout: 10000 });

	// Agent should not have started — no provider request sent
	expect(mock.requestBodies.length).toBe(0);

	await close();
	mock.server.close();
});
