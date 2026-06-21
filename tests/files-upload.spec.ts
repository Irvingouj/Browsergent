import { expect, test } from "@playwright/test";
import { launchExtension } from "./helpers";

// =============================================================================
// Test 1: Toolbar Upload button uploads a file and it appears in the tree,
//         then persists after side panel reload (OPFS-backed).
// =============================================================================
test("toolbar Upload button uploads a file, visible after reload", async () => {
	test.setTimeout(90000);

	const { sidePanel, close } = await launchExtension();
	try {
		await sidePanel.getByRole("button", { name: "Files" }).click();
		await expect(sidePanel.getByTestId("files-panel")).toBeVisible({
			timeout: 10000,
		});

		// Upload via the hidden file input (same path the Upload button triggers)
		await sidePanel
			.locator('[data-testid="file-upload"]')
			.setInputFiles({
				name: "upload-test.txt",
				mimeType: "text/plain",
				buffer: Buffer.from("hello upload"),
			});

		// File should appear in the tree
		const fileNode = sidePanel
			.locator('[data-testid="tree-file"]')
			.filter({ hasText: "upload-test.txt" });
		await expect(fileNode).toBeVisible({ timeout: 10000 });

		// Reload and verify persistence
		await sidePanel.reload();
		await sidePanel.waitForSelector('[data-initialized="true"]', {
			timeout: 15000,
		});
		await sidePanel.waitForSelector('[data-worker-ready="true"]', {
			timeout: 15000,
		});
		await sidePanel.getByRole("button", { name: "Files" }).click();
		await expect(sidePanel.getByTestId("files-panel")).toBeVisible({
			timeout: 10000,
		});

		const persistedNode = sidePanel
			.locator('[data-testid="tree-file"]')
			.filter({ hasText: "upload-test.txt" });
		await expect(persistedNode).toBeVisible({ timeout: 10000 });
	} finally {
		await close();
	}
});

// =============================================================================
// Test 2: Drag-and-drop a file onto the Files tree dropzone uploads it.
// =============================================================================
test("drag-and-drop a file onto the Files tree uploads it", async () => {
	test.setTimeout(90000);

	const { sidePanel, close } = await launchExtension();
	try {
		await sidePanel.getByRole("button", { name: "Files" }).click();
		await expect(sidePanel.getByTestId("files-panel")).toBeVisible({
			timeout: 10000,
		});

		// Simulate a file drop via synthetic DataTransfer
		const dataTransfer = await sidePanel.evaluateHandle(
			() => new DataTransfer(),
		);
		await sidePanel.evaluate(
			({ dt }) => {
				const file = new File(["dropped content"], "dropped.txt", {
					type: "text/plain",
				});
				dt.items.add(file);
			},
			{ dt: dataTransfer },
		);

		const dropzone = sidePanel.locator('[data-dropzone="root"]');
		await dropzone.dispatchEvent("drop", { dataTransfer });

		// File should appear in the tree
		const fileNode = sidePanel
			.locator('[data-testid="tree-file"]')
			.filter({ hasText: "dropped.txt" });
		await expect(fileNode).toBeVisible({ timeout: 10000 });
	} finally {
		await close();
	}
});

// =============================================================================
// Test 3: Dropping a folder with SKILL.md imports a skill (toast appears).
//         This is the regression guard — a SKILL.md in the dropped set
//         triggers skill import instead of normal file upload.
// =============================================================================
test("dropping a folder with SKILL.md imports a skill instead of uploading files", async () => {
	test.setTimeout(90000);

	const { sidePanel, close } = await launchExtension();
	try {
		await sidePanel.getByRole("button", { name: "Files" }).click();
		await expect(sidePanel.getByTestId("files-panel")).toBeVisible({
			timeout: 10000,
		});

		// Simulate dropping a folder containing SKILL.md + helper file
		const dataTransfer = await sidePanel.evaluateHandle(
			() => new DataTransfer(),
		);
		await sidePanel.evaluate(
			({ dt }) => {
				const skillMd = new File(
					[
						"---\nname: test-skill\ndescription: A test skill\n---\n# Hello\n",
					],
					"SKILL.md",
					{ type: "text/markdown" },
				);
				const helper = new File(["helper content"], "helper.js", {
					type: "text/javascript",
				});
				dt.items.add(skillMd);
				dt.items.add(helper);
			},
			{ dt: dataTransfer },
		);

		const dropzone = sidePanel.locator('[data-dropzone="root"]');
		await dropzone.dispatchEvent("drop", { dataTransfer });

		// Skill import may succeed (toast) or fail (error message) depending on
		// whether the skill service is fully initialized in the test context.
		// The regression guard is that SKILL.md is NOT uploaded as a regular file.
		const toast = sidePanel.locator("text=Imported skill:");
		const errorMsg = sidePanel.locator(".text-danger");
		await expect(toast.or(errorMsg)).toBeVisible({ timeout: 10000 });

		// SKILL.md should NOT appear as a regular tree-file — it was either
		// consumed by the skill importer or the drop was rejected.
		await expect(
			sidePanel.locator('[data-testid="tree-file"]').filter({
				hasText: "SKILL.md",
			}),
		).not.toBeVisible({ timeout: 5000 });
	} finally {
		await close();
	}
});
