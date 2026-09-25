import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
	configureMockProvider,
	launchExtension,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

// Helpers ------------------------------------------------------------------

const sessionMocks: Array<ReturnType<typeof startMockAnthropicServer>> = [];

async function configureFakeSettings(sidePanel: Page) {
	const mock = startMockAnthropicServer({
		responses: Array.from({ length: 4 }, () => ({
			chunks: [makeQuickChunk()],
			delays: [0],
			stopReason: "end_turn",
		})),
	});
	sessionMocks.push(mock);
	await configureMockProvider(sidePanel, mock.url);
}

async function configureMockSettings(sidePanel: Page, mockUrl: string) {
	await configureMockProvider(sidePanel, mockUrl);
}

async function addMessageWithoutMock(
	sidePanel: Locator,
	text: string = "test task",
) {
	await typeTask(sidePanel, text);
	await sidePanel.getByRole("button", { name: "Run task" }).click();
	await expect(
		sidePanel.locator('[data-testid="chat-message-user"]'),
	).toBeVisible({ timeout: 5000 });
	await sidePanel.waitForTimeout(1000);
}

function makeQuickChunk(text = "Done") {
	return (
		`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-quick", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n` +
		`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n` +
		`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}\n\n` +
		`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`
	);
}

function makeSlowChunk() {
	return `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-slow", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`;
}

test.afterEach(() => {
	for (const mock of sessionMocks.splice(0)) {
		mock.server.close();
	}
});

// Locator helpers for session items
function sessionTitleLocator(sidePanel: Locator) {
	return sidePanel.locator("span", { hasText: "Session" }).first();
}

function sessionItemLocator(sidePanel: Locator) {
	return sessionTitleLocator(sidePanel).locator("xpath=../..");
}

function floatingNewButton(sidePanel: Locator) {
	return sidePanel.getByTestId("floating-new-button");
}

function assistantMessageLocator(sidePanel: Locator, text: string) {
	return sidePanel
		.locator('[data-testid="chat-message-assistant"]')
		.locator(`text=${text}`);
}

// Tests --------------------------------------------------------------------

test("Panel opens via More options", async () => {
	const { sidePanel, close } = await launchExtension();
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await expect(sidePanel.getByTestId("new-session-button")).toBeVisible();
	await expect(
		sidePanel.getByRole("button", { name: "Open settings" }),
	).toBeVisible();
	await expect(sidePanel.locator("text=0 messages")).toBeVisible();
	await close();
});

test("Panel closes via × button", async () => {
	const { sidePanel, close } = await launchExtension();
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await expect(sidePanel.getByTestId("new-session-button")).toBeVisible();
	await sidePanel.locator('[data-testid="close-session-panel"]').click();
	await expect(sidePanel.getByTestId("new-session-button")).not.toBeVisible();
	await expect(
		sidePanel.getByRole("button", { name: "Open settings" }),
	).not.toBeVisible();
	await expect(sidePanel.locator("text=0 messages")).not.toBeVisible();
	await close();
});

test("Panel closes via overlay", async () => {
	const { sidePanel, close } = await launchExtension();
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await expect(sidePanel.getByTestId("new-session-button")).toBeVisible();
	await sidePanel.mouse.click(10, 100);
	await expect(sidePanel.getByTestId("new-session-button")).not.toBeVisible();
	await expect(
		sidePanel.getByRole("button", { name: "Open settings" }),
	).not.toBeVisible();
	await expect(sidePanel.locator("text=0 messages")).not.toBeVisible();
	await close();
});

test("Panel shows empty session", async () => {
	const { sidePanel, close } = await launchExtension();
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await expect(sidePanel.locator("text=0 messages")).toBeVisible();
	await close();
});

test("Create session from panel", async () => {
	const { sidePanel, close } = await launchExtension();
	await configureFakeSettings(sidePanel);
	await addMessageWithoutMock(sidePanel);
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await expect(sessionTitleLocator(sidePanel)).toBeVisible();
	await sidePanel.getByTestId("new-session-button").click();
	await expect(sidePanel.getByTestId("new-session-button")).not.toBeVisible();
	await expect(
		sidePanel.locator('[data-testid="chat-message-user"]'),
	).toHaveCount(0);
	await close();
});

test("Create session from floating button", async () => {
	const { sidePanel, close } = await launchExtension();
	await configureFakeSettings(sidePanel);
	await addMessageWithoutMock(sidePanel);
	await expect(floatingNewButton(sidePanel)).toBeVisible({ timeout: 5000 });
	await floatingNewButton(sidePanel).click();
	await expect(
		sidePanel.locator('[data-testid="chat-message-user"]'),
	).toHaveCount(0);
	await close();
});

test("Switch session", async () => {
	const { sidePanel, close } = await launchExtension();
	await configureFakeSettings(sidePanel);
	await addMessageWithoutMock(sidePanel, "Message A");
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByTestId("new-session-button").click();
	await sidePanel.waitForTimeout(500);
	await addMessageWithoutMock(sidePanel, "Message B");
	await sidePanel.waitForTimeout(2000);
	await sidePanel.getByRole("button", { name: "More options" }).click();
	// Session B is active (newest). Session A is inactive.
	const sessionItems = sidePanel
		.locator("span", { hasText: "Session" })
		.locator("xpath=../..");
	await expect(sessionItems).toHaveCount(2);
	await sessionItems.nth(1).click();
	await expect(sidePanel.locator("text=Message A")).toBeVisible();
	await expect(sidePanel.locator("text=Message B")).not.toBeVisible();
	await close();
});

test("tree rewind preserves the old branch and fork opens a child session", async () => {
	const { sidePanel, close } = await launchExtension();
	const mock = startMockAnthropicServer({
		responses: [
			"Answer one",
			"Answer two",
			"Answer on new branch",
			"Answer after reload",
			"Answer on original branch",
		].map((text) => ({
			chunks: [makeQuickChunk(text)],
			delays: [0],
			stopReason: "end_turn" as const,
		})),
	});
	sessionMocks.push(mock);
	await configureMockSettings(sidePanel, mock.url);

	for (const [question, answer] of [
		["Question one", "Answer one"],
		["Question two", "Answer two"],
	] as const) {
		await typeTask(sidePanel, question);
		await sidePanel.getByRole("button", { name: "Run task" }).click();
		await expect(
			sidePanel.locator('[data-testid="chat-message-assistant"]', {
				hasText: answer,
			}),
		).toBeVisible({ timeout: 10000 });
	}

	await typeTask(sidePanel, "/tree");
	await sidePanel.getByRole("button", { name: "Run task" }).click();
	const tree = sidePanel.getByTestId("transcript-tree-panel");
	await expect(tree).toBeVisible();
	const secondQuestion = tree
		.getByTestId("transcript-tree-entry")
		.filter({ hasText: "Question two" })
		.first();
	await secondQuestion.getByRole("button", { name: "Edit & rewind" }).click();
	await expect(tree).not.toBeVisible();
	await expect(sidePanel.getByTestId("task-input")).toContainText(
		"Question two",
	);
	await expect(sidePanel.locator("text=Question one")).toBeVisible();
	await expect(sidePanel.locator("text=Answer one")).toBeVisible();
	await expect(sidePanel.locator("text=Answer two")).not.toBeVisible();

	await sidePanel.getByRole("button", { name: "Run task" }).click();
	await expect(
		sidePanel.locator('[data-testid="chat-message-assistant"]', {
			hasText: "Answer on new branch",
		}),
	).toBeVisible({ timeout: 10000 });
	await expect(sidePanel.getByTestId("agent-status")).toHaveText("done", {
		timeout: 10000,
	});
	await expect(sidePanel.locator("text=Answer two")).not.toBeVisible();
	const branchRequest = JSON.stringify(mock.requestBodies[2]) ?? "";
	expect(branchRequest).toContain("Question one");
	expect(branchRequest).toContain("Answer one");
	expect(branchRequest).toContain("Question two");
	expect(branchRequest).not.toContain("Answer two");

	await sidePanel.reload();
	await expect(
		sidePanel.locator('[data-testid="chat-message-assistant"]', {
			hasText: "Answer on new branch",
		}),
	).toBeVisible({ timeout: 10000 });
	await expect(
		sidePanel
			.getByTestId("chat-message-assistant")
			.filter({ hasText: "Answer two" }),
	).toHaveCount(0);
	await typeTask(sidePanel, "Question after reload");
	await sidePanel.getByRole("button", { name: "Run task" }).click();
	await expect(
		sidePanel.locator('[data-testid="chat-message-assistant"]', {
			hasText: "Answer after reload",
		}),
	).toBeVisible({ timeout: 10000 });
	const reloadedBranchRequest = JSON.stringify(mock.requestBodies[3]) ?? "";
	expect(reloadedBranchRequest).toContain("Answer on new branch");
	expect(reloadedBranchRequest).not.toContain("Answer two");

	await sidePanel.getByTestId("open-transcript-tree").click();
	await expect(tree).toBeVisible();
	await expect(
		tree
			.getByTestId("transcript-tree-entry")
			.filter({ hasText: "Question two" })
			.first(),
	).toBeVisible();
	await expect(
		tree.getByTestId("transcript-tree-entry").filter({ hasText: "Answer two" }),
	).toBeVisible();
	const oldBranchAnswer = tree
		.getByTestId("transcript-tree-entry")
		.filter({ hasText: "Answer two" })
		.first();
	await oldBranchAnswer.getByRole("button", { name: "Continue here" }).click();
	await expect(tree).not.toBeVisible();
	await expect(
		sidePanel.locator('[data-testid="chat-message-assistant"]', {
			hasText: "Answer two",
		}),
	).toBeVisible();
	await expect(
		sidePanel
			.getByTestId("chat-message-assistant")
			.filter({ hasText: "Answer on new branch" }),
	).toHaveCount(0);
	await typeTask(sidePanel, "Continue the original branch");
	await sidePanel.getByRole("button", { name: "Run task" }).click();
	await expect(
		sidePanel.locator('[data-testid="chat-message-assistant"]', {
			hasText: "Answer on original branch",
		}),
	).toBeVisible({ timeout: 10000 });
	const originalBranchRequest = JSON.stringify(mock.requestBodies[4]) ?? "";
	expect(originalBranchRequest).toContain("Answer two");
	expect(originalBranchRequest).not.toContain("Answer on new branch");

	await sidePanel.getByTestId("open-transcript-tree").click();
	await expect(tree).toBeVisible();
	const branchAnswer = tree
		.getByTestId("transcript-tree-entry")
		.filter({ hasText: "Answer on new branch" })
		.first();
	await branchAnswer.getByRole("button", { name: "Fork here" }).click();
	await expect(tree).not.toBeVisible();
	await expect(
		sidePanel.locator('[data-testid="chat-message-assistant"]', {
			hasText: "Answer on new branch",
		}),
	).toBeVisible();
	await expect(
		sidePanel
			.getByTestId("chat-message-assistant")
			.filter({ hasText: "Answer after reload" }),
	).toHaveCount(0);

	const activeSessionRoot = sidePanel.locator("[data-initialized]");
	const previousSessionId = await activeSessionRoot.getAttribute(
		"data-active-session-id",
	);
	expect(previousSessionId).not.toBeNull();
	await typeTask(sidePanel, "/fork");
	await sidePanel.getByRole("button", { name: "Run task" }).click();
	await expect(activeSessionRoot).not.toHaveAttribute(
		"data-active-session-id",
		previousSessionId ?? "",
		{ timeout: 10000 },
	);
	await expect(
		sidePanel.locator('[data-testid="chat-message-assistant"]', {
			hasText: "Answer on new branch",
		}),
	).toBeVisible();
	await expect(
		sidePanel
			.getByTestId("chat-message-assistant")
			.filter({ hasText: "Answer after reload" }),
	).toHaveCount(0);
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await expect(sidePanel.getByTestId("close-session-panel")).toBeVisible();
	await expect(sidePanel.getByTestId("session-item")).toHaveCount(3, {
		timeout: 10000,
	});
	await close();
});

test("Delete session", async () => {
	const { sidePanel, close } = await launchExtension();
	await configureFakeSettings(sidePanel);
	await addMessageWithoutMock(sidePanel);
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await expect(sessionTitleLocator(sidePanel)).toBeVisible();
	const item = sessionItemLocator(sidePanel);
	await item.hover();
	await item.locator('button[type="button"]').click();
	await expect(sidePanel.locator("text=0 messages")).toBeVisible();
	await close();
});

test("Rename session", async () => {
	const { sidePanel, close } = await launchExtension();
	await configureFakeSettings(sidePanel);
	await addMessageWithoutMock(sidePanel);
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await expect(sessionTitleLocator(sidePanel)).toBeVisible();
	await sessionTitleLocator(sidePanel).click();
	const input = sidePanel.locator('input[type="text"]').first();
	await input.fill("My Session");
	await input.press("Enter");
	await expect(sidePanel.locator("text=My Session")).toBeVisible();
	await close();
});

test("Active session highlighted", async () => {
	const { sidePanel, close } = await launchExtension();
	await configureFakeSettings(sidePanel);
	await addMessageWithoutMock(sidePanel);
	await sidePanel.getByRole("button", { name: "More options" }).click();
	const item = sessionItemLocator(sidePanel);
	await expect(item).toBeVisible();
	await expect(item).toHaveCSS("border-left-color", "rgb(79, 127, 111)");
	await close();
});

test("Settings inside panel", async () => {
	const { sidePanel, close } = await launchExtension();
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByRole("button", { name: "Open settings" }).click();
	await expect(sidePanel.getByTestId("settings-list")).toBeVisible();
	await close();
});

test("Agent running allows switch while continuing in background", async () => {
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [makeQuickChunk()],
				delays: [0, 0, 0, 0],
				stopReason: "end_turn",
			},
			{
				chunks: [makeSlowChunk()],
				delays: [3000],
				stopReason: "end_turn",
			},
		],
	});
	const { sidePanel, close } = await launchExtension();
	await configureMockSettings(sidePanel, mock.url);
	await typeTask(sidePanel, "quick task");
	await sidePanel.getByRole("button", { name: "Run task" }).click();
	await expect(assistantMessageLocator(sidePanel, "Done")).toBeVisible({
		timeout: 5000,
	});
	await expect(floatingNewButton(sidePanel)).toBeVisible({ timeout: 5000 });
	await typeTask(sidePanel, "slow task");
	await sidePanel.getByRole("button", { name: "Run task" }).click();
	await sidePanel.waitForTimeout(500);
	await sidePanel.getByRole("button", { name: "More options" }).click();
	const item = sessionItemLocator(sidePanel);
	await expect(item).toBeVisible();
	await expect(item).not.toHaveCSS("opacity", "0.4");
	await expect(sidePanel.getByTestId("session-running-badge")).toBeVisible({
		timeout: 5000,
	});
	await item.click();
	await expect(sidePanel.locator("text=quick task")).toBeVisible({
		timeout: 5000,
	});
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await expect(sidePanel.getByTestId("session-running-badge")).toBeVisible();
	await close();
	mock.server.close();
});

test("Floating New button hidden when running", async () => {
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [makeQuickChunk()],
				delays: [0, 0, 0, 0],
				stopReason: "end_turn",
			},
			{
				chunks: [makeSlowChunk()],
				delays: [3000],
				stopReason: "end_turn",
			},
		],
	});
	const { sidePanel, close } = await launchExtension();
	await configureMockSettings(sidePanel, mock.url);
	await typeTask(sidePanel, "quick task");
	await sidePanel.getByRole("button", { name: "Run task" }).click();
	await expect(assistantMessageLocator(sidePanel, "Done")).toBeVisible({
		timeout: 5000,
	});
	await expect(floatingNewButton(sidePanel)).toBeVisible({ timeout: 5000 });
	await typeTask(sidePanel, "slow task");
	await sidePanel.getByRole("button", { name: "Run task" }).click();
	await expect(floatingNewButton(sidePanel)).toBeHidden();
	await close();
	mock.server.close();
});

test("Session persists after reload", async () => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "browsergent-test-"));
	const { sidePanel, close } = await launchExtension(tmpDir);
	await configureFakeSettings(sidePanel);
	await addMessageWithoutMock(sidePanel);
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await expect(sessionTitleLocator(sidePanel)).toBeVisible();
	await sidePanel.locator('[data-testid="close-session-panel"]').click();
	await close();

	const { sidePanel: sidePanel2, close: close2 } =
		await launchExtension(tmpDir);
	await sidePanel2.getByRole("button", { name: "More options" }).click();
	await expect(sessionTitleLocator(sidePanel2)).toBeVisible();
	await close2();
	await fs.rm(tmpDir, { recursive: true, force: true });
});

test("Empty session shown when active", async () => {
	const { sidePanel, close } = await launchExtension();
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByTestId("new-session-button").click();
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await expect(sidePanel.locator("text=0 messages")).toBeVisible();
	await close();
});

test("Delete last session auto-creates new", async () => {
	const { sidePanel, close } = await launchExtension();
	await configureFakeSettings(sidePanel);
	await addMessageWithoutMock(sidePanel);
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await expect(sessionTitleLocator(sidePanel)).toBeVisible();
	const item = sessionItemLocator(sidePanel);
	await item.hover();
	await item.locator('button[type="button"]').click();
	await expect(sidePanel.locator("text=0 messages")).toBeVisible();
	await close();
});
