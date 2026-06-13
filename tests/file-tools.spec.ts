import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	launchExtension,
	startMockAnthropicServer,
	uploadFileViaPanel,
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

function toolUseChunk(
	index: number,
	id: string,
	name: string,
	input: Record<string, unknown>,
): string {
	return [
		`event: content_block_start\ndata: ${JSON.stringify({
			type: "content_block_start",
			index,
			content_block: { type: "tool_use", id, name, input: {} },
		})}\n\n`,
		`event: content_block_delta\ndata: ${JSON.stringify({
			type: "content_block_delta",
			index,
			delta: { type: "input_json_delta", partial_json: JSON.stringify(input) },
		})}\n\n`,
		`event: content_block_stop\ndata: ${JSON.stringify({
			type: "content_block_stop",
			index,
		})}\n\n`,
	].join("");
}

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

test("file_list and file_read tools return session file content", async () => {
	test.setTimeout(90000);
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [
					MSG_START("msg-1"),
					toolUseChunk(0, "tc-list", "file_list", {}),
					BLOCK_STOP,
				],
				delays: [0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: [
					MSG_START("msg-2"),
					toolUseChunk(0, "tc-read", "file_read", { path: "notes.txt" }),
					BLOCK_STOP,
				],
				delays: [0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: [
					MSG_START("msg-3"),
					textChunk(0, "Done."),
					BLOCK_STOP,
				],
				delays: [0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});

	const { sidePanel, close } = await launchExtension();
	await configureMockProvider(sidePanel, mock.url);

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.getByTestId("files-panel")).toBeVisible();
	await uploadFileViaPanel(
		sidePanel,
		"notes.txt",
		"hello world",
		"text/plain",
	);
	await expect(sidePanel.locator("text=notes.txt")).toBeVisible();

	await sidePanel.getByRole("button", { name: "Chat" }).click();
	await sidePanel
		.locator('[data-testid="task-input"]')
		.fill("read the file");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	const listTrace = sidePanel.locator(
		'[data-testid="trace-entry"] >> text=file_list',
	);
	await expect(listTrace).toBeVisible({ timeout: 30000 });

	const readTrace = sidePanel.locator(
		'[data-testid="trace-entry"] >> text=file_read',
	);
	await expect(readTrace).toBeVisible({ timeout: 30000 });

	await expect(sidePanel.getByTestId("agent-status")).toHaveText("done", {
		timeout: 30000,
	});

	const traceEntries = sidePanel.locator('[data-testid="trace-entry"]');
	const count = await traceEntries.count();
	expect(count).toBeGreaterThanOrEqual(2);

	await close();
	mock.server.close();
});

test("file_edit tool modifies file content in OPFS", async () => {
	test.setTimeout(90000);
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [
					MSG_START("msg-1"),
					toolUseChunk(0, "tc-edit", "file_edit", {
						path: "notes.txt",
						old_string: "hello",
						new_string: "goodbye",
					}),
					BLOCK_STOP,
				],
				delays: [0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: [
					MSG_START("msg-2"),
					textChunk(0, "Edited."),
					BLOCK_STOP,
				],
				delays: [0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});

	const { sidePanel, close } = await launchExtension();
	await configureMockProvider(sidePanel, mock.url);

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await uploadFileViaPanel(
		sidePanel,
		"notes.txt",
		"hello world",
		"text/plain",
	);
	await expect(sidePanel.locator("text=notes.txt")).toBeVisible();

	await sidePanel.getByRole("button", { name: "Chat" }).click();
	await sidePanel
		.locator('[data-testid="task-input"]')
		.fill("edit the file");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	await expect(
		sidePanel.locator('[data-testid="trace-entry"] >> text=file_edit'),
	).toBeVisible({ timeout: 30000 });
	await expect(sidePanel.getByTestId("agent-status")).toHaveText("done", {
		timeout: 30000,
	});

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await sidePanel.locator("text=notes.txt").click();
	const preview = sidePanel.locator('[data-testid="file-preview"]');
	await expect(preview).toContainText("goodbye world", { timeout: 10000 });

	await close();
	mock.server.close();
});

test("file_delete tool removes file from session", async () => {
	test.setTimeout(90000);
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [
					MSG_START("msg-1"),
					toolUseChunk(0, "tc-del", "file_delete", { path: "notes.txt" }),
					BLOCK_STOP,
				],
				delays: [0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: [
					MSG_START("msg-2"),
					textChunk(0, "Deleted."),
					BLOCK_STOP,
				],
				delays: [0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});

	const { sidePanel, close } = await launchExtension();
	await configureMockProvider(sidePanel, mock.url);

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await uploadFileViaPanel(
		sidePanel,
		"notes.txt",
		"hello world",
		"text/plain",
	);
	await expect(sidePanel.locator("text=notes.txt")).toBeVisible();

	await sidePanel.getByRole("button", { name: "Chat" }).click();
	await sidePanel
		.locator('[data-testid="task-input"]')
		.fill("delete the file");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	await expect(
		sidePanel.locator('[data-testid="trace-entry"] >> text=file_delete'),
	).toBeVisible({ timeout: 30000 });
	await expect(sidePanel.getByTestId("agent-status")).toHaveText("done", {
		timeout: 30000,
	});

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.locator("text=notes.txt")).not.toBeVisible({
		timeout: 10000,
	});

	await close();
	mock.server.close();
});

test("file_read on missing file returns E_FILE_NOT_FOUND error in trace", async () => {
	test.setTimeout(90000);
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [
					MSG_START("msg-1"),
					toolUseChunk(0, "tc-miss", "file_read", { path: "missing.md" }),
					BLOCK_STOP,
				],
				delays: [0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: [
					MSG_START("msg-2"),
					textChunk(0, "File not found."),
					BLOCK_STOP,
				],
				delays: [0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});

	const { sidePanel, close } = await launchExtension();
	await configureMockProvider(sidePanel, mock.url);

	await sidePanel
		.locator('[data-testid="task-input"]')
		.fill("read missing file");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	const traceEntry = sidePanel.locator('[data-testid="trace-entry"]').first();
	await traceEntry.click();
	const resultPanel = sidePanel.locator("text=E_FILE_NOT_FOUND");
	await expect(resultPanel).toBeVisible({ timeout: 30000 });

	await close();
	mock.server.close();
});
