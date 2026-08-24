import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	launchExtension,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

// --- Mock Anthropic SSE helpers (same pattern as file-tools.spec.ts) ---

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

// --- Helper: navigate to Files tab ---
async function openFilesTab(sidePanel: import("@playwright/test").Page) {
	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.getByTestId("files-panel")).toBeVisible({
		timeout: 10000,
	});
}

// --- Helper: create a folder or file using the toolbar inline input ---
async function createViaToolbar(
	sidePanel: import("@playwright/test").Page,
	kind: "folder" | "file",
	name: string,
) {
	const buttonTestId =
		kind === "folder" ? "new-folder-button" : "new-file-button";
	const placeholder = kind === "folder" ? "folder name…" : "file name…";

	await sidePanel.getByTestId(buttonTestId).click();

	const input = sidePanel.locator(`input[placeholder="${placeholder}"]`);
	await expect(input).toBeVisible({ timeout: 5000 });
	await input.click();
	await input.pressSequentially(name, { delay: 10 });
	await input.press("Enter");
	// Wait for the input to disappear (creation complete)
	await expect(input).not.toBeVisible({ timeout: 5000 });
}

// --- Helper: wait for a tree node with given text ---
async function waitForTreeNode(
	sidePanel: import("@playwright/test").Page,
	testId: "tree-directory" | "tree-file",
	text: string,
	options?: { timeout?: number },
) {
	const node = sidePanel
		.locator(`[data-testid="${testId}"]`)
		.filter({ hasText: text });
	await expect(node).toBeVisible(options ?? { timeout: 10000 });
	return node;
}

// --- Helper: get root-level tree nodes ---
// TreeNode renders: <div><div data-testid="tree-*">...</div>{children}</div>
// file-tree contains: <div>{rootIds.map(id => <TreeNode ... />)}</div>
function rootTreeNodes(
	sidePanel: import("@playwright/test").Page,
	testId: "tree-directory" | "tree-file",
) {
	return sidePanel.locator(
		`[data-testid="file-tree"] > div > div > [data-testid="${testId}"]`,
	);
}

// =============================================================================
// Test 1: New Folder → create directory → appears → persists after reload
// =============================================================================
test("creates a folder via New Folder button, visible after side-panel reload", async () => {
	test.setTimeout(90000);

	const { sidePanel, close } = await launchExtension();
	try {
		await openFilesTab(sidePanel);

		// Create folder "notes"
		await createViaToolbar(sidePanel, "folder", "notes");
		await waitForTreeNode(sidePanel, "tree-directory", "notes");

		// Reload side panel and verify persistence
		await sidePanel.reload();
		await sidePanel.waitForSelector('[data-initialized="true"]', {
			timeout: 15000,
		});
		await sidePanel.waitForSelector('[data-worker-ready="true"]', {
			timeout: 15000,
		});
		await openFilesTab(sidePanel);

		await waitForTreeNode(sidePanel, "tree-directory", "notes");
	} finally {
		await close();
	}
});

// =============================================================================
// Test 2: New File → appears in tree → preview works
// =============================================================================
test("creates a file via New File button, shows preview when clicked", async () => {
	test.setTimeout(90000);

	const { sidePanel, close } = await launchExtension();
	try {
		await openFilesTab(sidePanel);

		// Create file "readme.md"
		await createViaToolbar(sidePanel, "file", "readme.md");
		const fileNode = await waitForTreeNode(sidePanel, "tree-file", "readme.md");

		// Click the file to see preview
		await fileNode.click();
		const preview = sidePanel.getByTestId("file-preview");
		await expect(preview).toBeVisible({ timeout: 10000 });

		// Preview shows the file name in its header
		await expect(preview).toContainText("readme.md", { timeout: 5000 });
	} finally {
		await close();
	}
});

// =============================================================================
// Test 3: Double-click rename → node updates
// =============================================================================
test("renames a file via double-click on the label", async () => {
	test.setTimeout(90000);

	const { sidePanel, close } = await launchExtension();
	try {
		await openFilesTab(sidePanel);

		// Create "old.md"
		await createViaToolbar(sidePanel, "file", "old.md");
		await waitForTreeNode(sidePanel, "tree-file", "old.md");

		// Double-click the label span inside the tree-file node
		const labelSpan = sidePanel
			.locator('[data-testid="tree-file"] span')
			.filter({ hasText: "old.md" });
		await labelSpan.dblclick();

		// Rename input should appear
		const renameInput = sidePanel.getByTestId("tree-node-rename-input");
		await expect(renameInput).toBeVisible({ timeout: 5000 });

		// Select all existing text and type new name character-by-character
		// (pressSequentially avoids React/Preact controlled-input race with fill())
		await renameInput.click();
		await renameInput.press(
			process.platform === "darwin" ? "Meta+A" : "Control+A",
		);
		await renameInput.pressSequentially("new.md", { delay: 10 });
		await renameInput.press("Enter");

		// Old name gone, new name appears
		await expect(
			sidePanel
				.locator('[data-testid="tree-file"]')
				.filter({ hasText: "old.md" }),
		).not.toBeVisible({ timeout: 10000 });
		await waitForTreeNode(sidePanel, "tree-file", "new.md");
	} finally {
		await close();
	}
});

// =============================================================================
// Test 4: Move file into a directory via context menu "Move…"
// =============================================================================
test("moves a file into a directory via context menu Move… prompt", async () => {
	test.setTimeout(90000);

	const { sidePanel, close } = await launchExtension();
	try {
		await openFilesTab(sidePanel);

		// Create folder "target"
		await createViaToolbar(sidePanel, "folder", "target");
		await waitForTreeNode(sidePanel, "tree-directory", "target");

		// Create file "movable.md" at root
		await createViaToolbar(sidePanel, "file", "movable.md");
		await waitForTreeNode(sidePanel, "tree-file", "movable.md");

		// Sanity check: movable.md appears at root level before the move
		await expect(
			rootTreeNodes(sidePanel, "tree-file").filter({ hasText: "movable.md" }),
		).toBeVisible({ timeout: 5000 });

		// Right-click the file to open context menu
		const movableNode = sidePanel
			.locator('[data-testid="tree-file"]')
			.filter({ hasText: "movable.md" });
		await movableNode.click({ button: "right" });

		const contextMenu = sidePanel.getByTestId("context-menu");
		await expect(contextMenu).toBeVisible({ timeout: 5000 });

		// Click "Move…" in the context menu
		await contextMenu.getByRole("button", { name: "Move…" }).click();

		// Move prompt input appears
		const moveInputWrapper = sidePanel.getByTestId("move-target-input");
		await expect(moveInputWrapper).toBeVisible({ timeout: 5000 });

		// Type target path and confirm (pressSequentially for Preact controlled input)
		const moveInput = moveInputWrapper.locator("input");
		await moveInput.click();
		await moveInput.pressSequentially("/target", { delay: 10 });
		await moveInput.press("Enter");

		// Wait for the move prompt to disappear
		await expect(moveInputWrapper).not.toBeVisible({ timeout: 5000 });

		// The file should no longer appear at root level
		await expect(
			rootTreeNodes(sidePanel, "tree-file").filter({ hasText: "movable.md" }),
		).not.toBeVisible({ timeout: 10000 });

		// Expand "target" directory and check movable.md is inside
		const targetNode = sidePanel
			.locator('[data-testid="tree-directory"]')
			.filter({ hasText: "target" });
		await targetNode.click(); // expand

		// Now "movable.md" should be visible under target
		await expect(
			sidePanel
				.locator('[data-testid="tree-file"]')
				.filter({ hasText: "movable.md" }),
		).toBeVisible({ timeout: 10000 });
	} finally {
		await close();
	}
});

// =============================================================================
// Test 5: Delete non-empty directory via context menu
// =============================================================================
test("deletes a non-empty directory via context menu Delete button", async () => {
	test.setTimeout(90000);

	// Use a mock agent to create a file inside a directory (file_write handles
	// parent directory creation automatically). Then delete the directory via UI.
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [
					MSG_START("msg-1"),
					toolUseChunk(0, "tc-write", "file_write", {
						path: "todir/inner.md",
						content: "hello",
					}),
					BLOCK_STOP,
				],
				delays: [0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: [MSG_START("msg-2"), textChunk(0, "Done."), BLOCK_STOP],
				delays: [0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});

	const { sidePanel, close } = await launchExtension();
	try {
		await configureMockProvider(sidePanel, mock.url);

		// Ask agent to create todir/inner.md (this creates both dir and file)
		await typeTask(sidePanel, "create todir/inner.md");
		await sidePanel.getByRole("button", { name: "Run task" }).click();

		await expect(sidePanel.getByTestId("agent-status")).toHaveText("done", {
			timeout: 30000,
		});

		// Switch to Files tab and verify the directory exists
		await openFilesTab(sidePanel);
		await waitForTreeNode(sidePanel, "tree-directory", "todir");

		// Right-click the "todir" directory
		const todirNode = sidePanel
			.locator('[data-testid="tree-directory"]')
			.filter({ hasText: "todir" });
		await todirNode.click({ button: "right" });

		const contextMenu = sidePanel.getByTestId("context-menu");
		await expect(contextMenu).toBeVisible({ timeout: 5000 });

		// Click "Delete" (the red button)
		await contextMenu.getByRole("button", { name: "Delete" }).click();

		// Directory should disappear
		await expect(
			sidePanel
				.locator('[data-testid="tree-directory"]')
				.filter({ hasText: "todir" }),
		).not.toBeVisible({ timeout: 10000 });
	} finally {
		await close();
		mock.server.close();
	}
});

// =============================================================================
// OPFS helpers — mutate disk UNDER the Files tree (no UI / store update).
// Mirrors agent run_js fs.move/delete: OPFS changes while the in-memory tree
// still shows the old paths. Opening Files / clicking must re-list and recover.
// =============================================================================
async function opfsWriteText(
	sidePanel: import("@playwright/test").Page,
	path: string,
	content: string,
): Promise<void> {
	await sidePanel.evaluate(
		async ({ path: p, content: c }) => {
			const root = await navigator.storage.getDirectory();
			const parts = p.replace(/^\/+/, "").split("/").filter(Boolean);
			if (parts.length === 0) throw new Error("empty path");
			let dir = root;
			for (let i = 0; i < parts.length - 1; i++) {
				dir = await dir.getDirectoryHandle(parts[i]!, { create: true });
			}
			const fh = await dir.getFileHandle(parts[parts.length - 1]!, {
				create: true,
			});
			const w = await fh.createWritable();
			await w.write(c);
			await w.close();
		},
		{ path, content },
	);
}

async function opfsRemove(
	sidePanel: import("@playwright/test").Page,
	path: string,
): Promise<void> {
	await sidePanel.evaluate(async (p) => {
		const root = await navigator.storage.getDirectory();
		const parts = p.replace(/^\/+/, "").split("/").filter(Boolean);
		if (parts.length === 0) throw new Error("empty path");
		let dir = root;
		for (let i = 0; i < parts.length - 1; i++) {
			dir = await dir.getDirectoryHandle(parts[i]!);
		}
		await dir.removeEntry(parts[parts.length - 1]!, { recursive: true });
	}, path);
}

async function opfsMove(
	sidePanel: import("@playwright/test").Page,
	from: string,
	to: string,
): Promise<void> {
	// Read + write + remove so we do not depend on FileSystemHandle.move support.
	const text = await sidePanel.evaluate(async (p) => {
		const root = await navigator.storage.getDirectory();
		const parts = p.replace(/^\/+/, "").split("/").filter(Boolean);
		let dir = root;
		for (let i = 0; i < parts.length - 1; i++) {
			dir = await dir.getDirectoryHandle(parts[i]!);
		}
		const fh = await dir.getFileHandle(parts[parts.length - 1]!);
		const file = await fh.getFile();
		return await file.text();
	}, from);
	await opfsWriteText(sidePanel, to, text);
	await opfsRemove(sidePanel, from);
}

// =============================================================================
// Test 6: Opening Files re-lists OPFS after an out-of-band move (ghost prune)
// =============================================================================
//
// Regression: agent/run_js fs.move updates OPFS but used to leave the old path
// in the Files tree. Clicking the ghost showed E_NOT_FOUND. Opening the Files
// tab must re-list OPFS so the old path is gone and the new path opens cleanly.
test("opening Files tab prunes ghost nodes after out-of-band OPFS move", async () => {
	test.setTimeout(90000);

	const { sidePanel, close } = await launchExtension();
	try {
		await openFilesTab(sidePanel);

		// Seed a root file through the UI so the tree has loaded root children
		// (the historical skip-if-loaded path) and shows ghost.md.
		await createViaToolbar(sidePanel, "file", "ghost.md");
		await waitForTreeNode(sidePanel, "tree-file", "ghost.md");
		// Give the empty toolbar file real content so the destination preview is checkable.
		await opfsWriteText(sidePanel, "/ghost.md", "moved-body");

		// Leave Files so the in-memory tree is not live-updated; then move under
		// the tree the way agent run_js fs.move does (OPFS only).
		await sidePanel.getByRole("button", { name: "Chat" }).click();
		await expect(sidePanel.getByTestId("files-panel")).not.toBeVisible({
			timeout: 5000,
		});
		await opfsMove(sidePanel, "/ghost.md", "/dest/ghost.md");

		// Click into Files — mount must re-list OPFS (not reuse stale rootIds).
		await openFilesTab(sidePanel);

		// Ghost at root must be gone.
		await expect(
			rootTreeNodes(sidePanel, "tree-file").filter({ hasText: "ghost.md" }),
		).toHaveCount(0, { timeout: 15000 });

		// dest/ exists and holds the moved file.
		const destNode = await waitForTreeNode(sidePanel, "tree-directory", "dest");
		await destNode.click(); // expand → re-lists children from OPFS
		const moved = await waitForTreeNode(sidePanel, "tree-file", "ghost.md");

		// Click must open a real preview, not E_NOT_FOUND / not-found error.
		await moved.click();
		const preview = sidePanel.getByTestId("file-preview");
		await expect(preview).toBeVisible({ timeout: 10000 });
		await expect(preview).toContainText("moved-body", { timeout: 10000 });
		await expect(preview).not.toContainText(
			/E_NOT_FOUND|not found|no longer exists/i,
		);
		await expect(sidePanel.locator(".text-danger")).toHaveCount(0);
	} finally {
		await close();
	}
});

// =============================================================================
// Test 7: Clicking a vanished path refreshes the tree (no stuck E_NOT_FOUND)
// =============================================================================
test("clicking a deleted file refreshes the tree instead of E_NOT_FOUND", async () => {
	test.setTimeout(90000);

	const { sidePanel, close } = await launchExtension();
	try {
		await openFilesTab(sidePanel);
		await createViaToolbar(sidePanel, "file", "vanish.md");
		const vanish = await waitForTreeNode(sidePanel, "tree-file", "vanish.md");

		// Delete from OPFS under the live tree (no store update) — same class of
		// bug as agent fs.delete while the Files panel still shows the node.
		await opfsRemove(sidePanel, "/vanish.md");

		// Click the ghost. Refresh-before-open must prune it and avoid E_NOT_FOUND.
		await vanish.click();

		await expect(
			sidePanel.getByText(/File no longer exists/i),
		).toBeVisible({ timeout: 10000 });
		await expect(
			sidePanel
				.locator('[data-testid="tree-file"]')
				.filter({ hasText: "vanish.md" }),
		).toHaveCount(0, { timeout: 10000 });

		const preview = sidePanel.getByTestId("file-preview");
		await expect(preview).toHaveCount(0);
		await expect(sidePanel.getByText(/E_NOT_FOUND/i)).toHaveCount(0);
	} finally {
		await close();
	}
});
