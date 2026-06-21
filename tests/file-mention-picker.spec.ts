import { expect, test } from "@playwright/test";
import { launchExtension, uploadFileViaPanel } from "./helpers";

test("@ picker inserts file mention token into task input", async () => {
	test.setTimeout(60000);
	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.getByTestId("files-panel")).toBeVisible({
		timeout: 10000,
	});
	await uploadFileViaPanel(
		sidePanel,
		"picker.txt",
		"picker test content",
		"text/plain",
	);
	await expect(sidePanel.locator("text=picker.txt")).toBeVisible({
		timeout: 10000,
	});

	await sidePanel.getByRole("button", { name: "Chat" }).click();
	const taskInput = sidePanel.locator('[data-testid="task-input"]');
	await taskInput.click();
	await taskInput.fill("@");
	await expect(sidePanel.getByTestId("command-picker")).toBeVisible({
		timeout: 5000,
	});
	await expect(
		sidePanel.getByTestId("command-picker").locator("text=picker.txt").first(),
	).toBeVisible();

	await sidePanel
		.getByTestId("command-picker-item-/picker.txt")
		.click();

	const value = await taskInput.inputValue();
	expect(value).toMatch(/@\[file:[^:\]]+:picker\.txt\]/);

	await close();
});

test("@ picker ArrowDown moves highlight to second row and stays there", async () => {
	test.setTimeout(60000);
	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.getByTestId("files-panel")).toBeVisible({
		timeout: 10000,
	});
	await uploadFileViaPanel(
		sidePanel,
		"alpha.txt",
		"alpha content",
		"text/plain",
	);
	await uploadFileViaPanel(
		sidePanel,
		"beta.txt",
		"beta content",
		"text/plain",
	);
	await expect(sidePanel.locator("text=alpha.txt")).toBeVisible({
		timeout: 10000,
	});
	await expect(sidePanel.locator("text=beta.txt")).toBeVisible({
		timeout: 10000,
	});

	await sidePanel.getByRole("button", { name: "Chat" }).click();
	const taskInput = sidePanel.locator('[data-testid="task-input"]');
	await taskInput.click();
	await taskInput.fill("@");
	await expect(sidePanel.getByTestId("command-picker")).toBeVisible({
		timeout: 5000,
	});

	// Move to second row with ArrowDown
	await taskInput.press("ArrowDown");
	// Second row should now be active
	await expect(
		sidePanel.locator('[data-picker-index="1"]'),
	).toHaveClass(/bg-accent-soft/);
	// First row should NOT be active
	await expect(
		sidePanel.locator('[data-picker-index="0"]'),
	).not.toHaveClass(/bg-accent-soft/);

	await close();
});

test("@ picker typing query resets active row to 0", async () => {
	test.setTimeout(60000);
	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.getByTestId("files-panel")).toBeVisible({
		timeout: 10000,
	});
	await uploadFileViaPanel(
		sidePanel,
		"doc-1.txt",
		"doc-1 content",
		"text/plain",
	);
	await uploadFileViaPanel(
		sidePanel,
		"doc-2.txt",
		"doc-2 content",
		"text/plain",
	);
	await uploadFileViaPanel(
		sidePanel,
		"doc-3.txt",
		"doc-3 content",
		"text/plain",
	);
	await expect(sidePanel.locator("text=doc-1.txt")).toBeVisible({
		timeout: 10000,
	});

	await sidePanel.getByRole("button", { name: "Chat" }).click();
	const taskInput = sidePanel.locator('[data-testid="task-input"]');
	await taskInput.click();
	await taskInput.fill("@doc");
	await expect(sidePanel.getByTestId("command-picker")).toBeVisible({
		timeout: 5000,
	});

	// Move to second row (index 1)
	await taskInput.press("ArrowDown");
	await expect(
		sidePanel.locator('[data-picker-index="1"]'),
	).toHaveClass(/bg-accent-soft/);

	// Type an extra char to narrow the query — active row must reset to 0
	await taskInput.press("1");
	// After query narrows to "doc1", the filter changes; activeIndex must be back at 0
	await expect(
		sidePanel.locator('[data-picker-index="0"]'),
	).toHaveClass(/bg-accent-soft/);

	await close();
});

test("@ picker shows non-text files (pdf, png) — exclude nothing", async () => {
	test.setTimeout(60000);
	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.getByTestId("files-panel")).toBeVisible({
		timeout: 10000,
	});

	const pdfBytes = "%PDF-1.4 fake binary content";
	await uploadFileViaPanel(
		sidePanel,
		"report.pdf",
		pdfBytes,
		"application/pdf",
	);
	await expect(sidePanel.locator("text=report.pdf")).toBeVisible({
		timeout: 10000,
	});

	await uploadFileViaPanel(
		sidePanel,
		"image.png",
		"\x89PNG\r\n\x1a\n",
		"image/png",
	);
	await expect(sidePanel.locator("text=image.png")).toBeVisible({
		timeout: 10000,
	});

	await sidePanel.getByRole("button", { name: "Chat" }).click();
	const taskInput = sidePanel.locator('[data-testid="task-input"]');
	await taskInput.click();
	await taskInput.fill("@");
	await expect(sidePanel.getByTestId("command-picker")).toBeVisible({
		timeout: 5000,
	});

	const picker = sidePanel.getByTestId("command-picker");
	await expect(picker.locator("text=report.pdf").first()).toBeVisible({
		timeout: 5000,
	});
	await expect(picker.locator("text=image.png").first()).toBeVisible({
		timeout: 5000,
	});

	await close();
});
