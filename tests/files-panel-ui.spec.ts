import { expect, test } from "@playwright/test";
import {
	launchExtension,
	uploadBinaryViaPanel,
	uploadFileViaPanel,
} from "./helpers";

const MD_CONTENT = "# Preview heading\n\nMarkdown preview body.";

test("files panel shows tabs, previews, and preserves selection across tab switches", async () => {
	test.setTimeout(60000);
	const { sidePanel, close } = await launchExtension();

	await expect(sidePanel.getByRole("button", { name: "Chat" })).toBeVisible();
	await expect(sidePanel.getByRole("button", { name: "Files" })).toBeVisible();
	await expect(sidePanel.getByRole("button", { name: "JS" })).toHaveCount(0);

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.getByTestId("files-panel")).toBeVisible();

	// 1x1 transparent PNG.
	const PNG_1X1 =
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
	await uploadBinaryViaPanel(sidePanel, "image.png", PNG_1X1, "image/png");
	await expect(sidePanel.locator("text=image.png")).toBeVisible({
		timeout: 10000,
	});
	await sidePanel.locator("text=image.png").click();
	await expect(
		sidePanel.getByTestId("file-preview").locator("img"),
	).toBeVisible({ timeout: 10000 });

	await uploadFileViaPanel(sidePanel, "notes.md", MD_CONTENT, "text/markdown");
	await expect(sidePanel.locator("text=notes.md")).toBeVisible({
		timeout: 10000,
	});
	await sidePanel.getByTestId("file-tree").getByText("notes.md").click();
	await expect(sidePanel.getByTestId("file-preview")).toContainText(
		"Markdown preview body.",
		{ timeout: 10000 },
	);

	// Markdown renders as formatted HTML (h1), not raw source.
	await expect(
		sidePanel.getByTestId("file-preview").locator("h1").first(),
	).toContainText("Preview heading", { timeout: 10000 });

	await sidePanel.getByRole("button", { name: "Chat" }).click();
	await expect(sidePanel.getByTestId("files-panel")).not.toBeVisible();

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.getByTestId("file-preview")).toContainText(
		"Markdown preview body.",
		{ timeout: 10000 },
	);

	await sidePanel.getByRole("button", { name: "Chat" }).click();
	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.getByTestId("file-preview")).toContainText(
		"Markdown preview body.",
		{ timeout: 10000 },
	);

	await close();
});

test("video file renders an inline <video controls> preview", async () => {
	test.setTimeout(60000);
	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.getByTestId("files-panel")).toBeVisible();

	// Minimal mp4: ftyp(isom) + mdat. Decodes enough to attach a source and render controls.
	const MIN_MP4 = "AAAAGGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=";
	await uploadBinaryViaPanel(sidePanel, "clip.mp4", MIN_MP4, "video/mp4");
	await expect(sidePanel.locator("text=clip.mp4")).toBeVisible({
		timeout: 10000,
	});
	await sidePanel.locator("text=clip.mp4").click();
	const video = sidePanel.getByTestId("file-preview").locator("video");
	await expect(video).toBeVisible({ timeout: 10000 });
	await expect(video).toHaveAttribute("controls");

	await close();
});

test("markdown and js previews render formatted content with a drag handle", async () => {
	test.setTimeout(60000);
	const { sidePanel, close } = await launchExtension();

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.getByTestId("files-panel")).toBeVisible();

	// JS file: highlightCode wraps tokens in .token-* spans.
	await uploadFileViaPanel(
		sidePanel,
		"app.js",
		"const greet = function () { return 'hi'; };",
		"text/javascript",
	);
	await expect(sidePanel.locator("text=app.js")).toBeVisible({
		timeout: 10000,
	});
	await sidePanel.locator("text=app.js").click();
	const preview = sidePanel.getByTestId("file-preview");
	// keyword (const) or function-def token must be present.
	await expect(preview.locator("[class^='token-']").first()).toBeVisible({
		timeout: 10000,
	});
	// Drag handle present.
	await expect(
		preview.locator('[data-testid="preview-drag-handle"]'),
	).toBeVisible();

	// Dragging the handle up grows the preview height.
	const before = await preview.evaluate((el) =>
		Number((el as HTMLElement).style.height.replace("px", "")),
	);
	const handle = preview.locator('[data-testid="preview-drag-handle"]');
	const box = await handle.boundingBox();
	expect(box).not.toBeNull();
	await sidePanel.mouse.move(box!.x + 5, box!.y + 5);
	await sidePanel.mouse.down();
	await sidePanel.mouse.move(box!.x + 5, box!.y - 80); // drag up → grow
	await sidePanel.mouse.up();
	const after = await preview.evaluate((el) =>
		Number((el as HTMLElement).style.height.replace("px", "")),
	);
	expect(after).toBeGreaterThan(before);

	await close();
});

test("preview height resets to the per-type default when switching files", async () => {
	test.setTimeout(60000);
	const { sidePanel, close } = await launchExtension();
	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.getByTestId("files-panel")).toBeVisible();

	const PNG_1X1 =
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
	await uploadBinaryViaPanel(sidePanel, "image.png", PNG_1X1, "image/png");
	await sidePanel.locator("text=image.png").click();
	const preview = sidePanel.getByTestId("file-preview");
	await expect(preview.locator("img")).toBeVisible({ timeout: 10000 });
	const imageHeight = await preview.evaluate((el) =>
		Number((el as HTMLElement).style.height.replace("px", "")),
	);
	expect(imageHeight).toBe(420); // defaultPreviewHeightPx("image")

	await uploadFileViaPanel(
		sidePanel,
		"notes.md",
		"# h\n\nbody",
		"text/markdown",
	);
	await sidePanel.getByTestId("file-tree").getByText("notes.md").click();
	await expect(preview.locator("h1").first()).toBeVisible({ timeout: 10000 });
	const textHeight = await preview.evaluate((el) =>
		Number((el as HTMLElement).style.height.replace("px", "")),
	);
	expect(textHeight).toBe(240); // defaultPreviewHeightPx("text")

	await close();
});
