import { expect, test } from "@playwright/test";
import { launchExtension, startMockAnthropicServer } from "./helpers";

test("files survive session switch", async () => {
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello world" } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
				],
				delays: [0, 0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});

	const { sidePanel, close } = await launchExtension();

	// Configure settings
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByRole("button", { name: "Open settings" }).click();
	await sidePanel.locator('input[type="password"]').fill("fake-key");
	await sidePanel.locator('input[type="text"]').nth(0).fill(mock.url);
	await sidePanel.getByRole("button", { name: "Save settings" }).click();
	await expect(sidePanel.locator('input[type="password"]')).not.toBeVisible();
	await sidePanel.locator('[data-testid="close-session-panel"]').click();

	// Run a task to give the session a message (so it appears in the session list)
	await sidePanel.locator('[data-testid="task-input"]').fill("test task");
	await sidePanel.getByRole("button", { name: "Run task" }).click();
	await expect(sidePanel.locator("text=Hello world")).toBeVisible({
		timeout: 10000,
	});

	// Upload a file in the default session
	await sidePanel.getByRole("button", { name: "Files" }).click();

	// Create a test file using the file input
	const fileContent = "Hello from session A";
	await sidePanel.evaluate((content) => {
		const dataTransfer = new DataTransfer();
		const file = new File([content], "test.txt", { type: "text/plain" });
		dataTransfer.items.add(file);
		const input = document.querySelector(
			'[data-testid="file-upload"]',
		) as HTMLInputElement;
		if (input) {
			input.files = dataTransfer.files;
			input.dispatchEvent(new Event("change", { bubbles: true }));
		}
	}, fileContent);

	// Wait for the file to appear in the tree
	await expect(sidePanel.locator("text=test.txt")).toBeVisible({
		timeout: 10000,
	});

	// Click on the file to preview it
	await sidePanel.locator("text=test.txt").click();
	await expect(sidePanel.locator("text=Hello from session A")).toBeVisible({
		timeout: 10000,
	});

	// Open session panel and create a new session
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByTestId("new-session-button").click();

	// Wait for the new session to be active (chat tab should be empty)
	await sidePanel.getByRole("button", { name: "Chat" }).click();
	await expect(sidePanel.locator("text=test task")).not.toBeVisible();

	// Files panel in new session should be empty
	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.locator("text=No files yet")).toBeVisible();

	// Switch back to the first session
	await sidePanel.getByRole("button", { name: "More options" }).click();
	// The first session should be visible in the list (it has messages)
	const sessionItems = sidePanel.getByTestId("session-item");
	const count = await sessionItems.count();
	// There should be at least 2 sessions
	expect(count).toBeGreaterThanOrEqual(2);

	// Click the first non-active session to switch back
	for (let i = 0; i < count; i++) {
		const item = sessionItems.nth(i);
		const isActive = await item.evaluate((el) =>
			el.classList.contains("bg-accent-soft"),
		);
		if (!isActive) {
			await item.click();
			break;
		}
	}

	// Wait for switch and verify file is still there
	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.locator("text=test.txt")).toBeVisible({
		timeout: 10000,
	});

	// Verify preview still works
	await sidePanel.locator("text=test.txt").click();
	await expect(sidePanel.locator("text=Hello from session A")).toBeVisible({
		timeout: 10000,
	});

	await close();
	mock.server.close();
});

test("deleting a session cleans up its files", async () => {
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello world" } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
				],
				delays: [0, 0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});

	const { sidePanel, close } = await launchExtension();

	// Configure settings
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByRole("button", { name: "Open settings" }).click();
	await sidePanel.locator('input[type="password"]').fill("fake-key");
	await sidePanel.locator('input[type="text"]').nth(0).fill(mock.url);
	await sidePanel.getByRole("button", { name: "Save settings" }).click();
	await expect(sidePanel.locator('input[type="password"]')).not.toBeVisible();
	await sidePanel.locator('[data-testid="close-session-panel"]').click();

	// Run a task to give the session a message
	await sidePanel.locator('[data-testid="task-input"]').fill("test task");
	await sidePanel.getByRole("button", { name: "Run task" }).click();
	await expect(sidePanel.locator("text=Hello world")).toBeVisible({
		timeout: 10000,
	});

	// Upload a file
	await sidePanel.getByRole("button", { name: "Files" }).click();
	await sidePanel.evaluate(() => {
		const dataTransfer = new DataTransfer();
		const file = new File(["delete me"], "delete-me.txt", {
			type: "text/plain",
		});
		dataTransfer.items.add(file);
		const input = document.querySelector(
			'[data-testid="file-upload"]',
		) as HTMLInputElement;
		if (input) {
			input.files = dataTransfer.files;
			input.dispatchEvent(new Event("change", { bubbles: true }));
		}
	});
	await expect(sidePanel.locator("text=delete-me.txt")).toBeVisible({
		timeout: 10000,
	});

	// Open session panel and delete the current session
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByTestId("delete-session-button").first().click();

	// Close session panel after deletion
	await sidePanel.locator('[data-testid="close-session-panel"]').click();

	// After deletion, a new empty session should be active
	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.locator("text=No files yet")).toBeVisible({
		timeout: 10000,
	});

	await close();
	mock.server.close();
});

test("sessions keep file trees isolated when switching both ways", async () => {
	test.setTimeout(90000);
	const mockResponse = {
		chunks: [
			`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
			`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
			`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello world" } })}\n\n`,
			`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
		],
		delays: [0, 0, 0, 0],
		stopReason: "end_turn",
	};
	const mock = startMockAnthropicServer({
		responses: [mockResponse, mockResponse],
	});

	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByRole("button", { name: "Open settings" }).click();
	await sidePanel.locator('input[type="password"]').fill("fake-key");
	await sidePanel.locator('input[type="text"]').nth(0).fill(mock.url);
	await sidePanel.getByRole("button", { name: "Save settings" }).click();
	await expect(sidePanel.locator('input[type="password"]')).not.toBeVisible();
	await sidePanel.locator('[data-testid="close-session-panel"]').click();

	await sidePanel.locator('[data-testid="task-input"]').fill("session A task");
	await sidePanel.getByRole("button", { name: "Run task" }).click();
	await expect(sidePanel.locator("text=Hello world")).toBeVisible({
		timeout: 10000,
	});

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await sidePanel.evaluate(() => {
		const dataTransfer = new DataTransfer();
		const file = new File(["content A"], "file-a.txt", { type: "text/plain" });
		dataTransfer.items.add(file);
		const input = document.querySelector(
			'[data-testid="file-upload"]',
		) as HTMLInputElement;
		if (input) {
			input.files = dataTransfer.files;
			input.dispatchEvent(new Event("change", { bubbles: true }));
		}
	});
	await expect(sidePanel.locator("text=file-a.txt")).toBeVisible({
		timeout: 10000,
	});
	await expect(sidePanel.locator("text=file-b.txt")).not.toBeVisible();

	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByTestId("new-session-button").click();
	await sidePanel.locator('[data-testid="close-session-panel"]').click();

	await sidePanel.locator('[data-testid="task-input"]').fill("session B task");
	await sidePanel.getByRole("button", { name: "Run task" }).click();
	await expect(sidePanel.locator("text=Hello world")).toBeVisible({
		timeout: 10000,
	});

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await sidePanel.evaluate(() => {
		const dataTransfer = new DataTransfer();
		const file = new File(["content B"], "file-b.txt", { type: "text/plain" });
		dataTransfer.items.add(file);
		const input = document.querySelector(
			'[data-testid="file-upload"]',
		) as HTMLInputElement;
		if (input) {
			input.files = dataTransfer.files;
			input.dispatchEvent(new Event("change", { bubbles: true }));
		}
	});
	await expect(sidePanel.locator("text=file-b.txt")).toBeVisible({
		timeout: 10000,
	});
	await expect(sidePanel.locator("text=file-a.txt")).not.toBeVisible();

	const sessionItems = sidePanel.getByTestId("session-item");

	async function switchToInactiveSession() {
		await sidePanel.getByRole("button", { name: "More options" }).click();
		const count = await sessionItems.count();
		expect(count).toBeGreaterThanOrEqual(2);
		for (let i = 0; i < count; i++) {
			const item = sessionItems.nth(i);
			const isActive = await item.evaluate((el) =>
				el.classList.contains("bg-accent-soft"),
			);
			if (!isActive) {
				await item.click();
				break;
			}
		}
		await sidePanel.locator('[data-testid="close-session-panel"]').click();
	}

	await switchToInactiveSession();
	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.locator("text=file-a.txt")).toBeVisible({
		timeout: 10000,
	});
	await expect(sidePanel.locator("text=file-b.txt")).not.toBeVisible();

	await switchToInactiveSession();
	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.locator("text=file-b.txt")).toBeVisible({
		timeout: 10000,
	});
	await expect(sidePanel.locator("text=file-a.txt")).not.toBeVisible();

	await close();
	mock.server.close();
});
