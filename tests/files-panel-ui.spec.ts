import { expect, test } from "@playwright/test";
import { launchExtension, uploadBinaryViaPanel, uploadFileViaPanel } from "./helpers";

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
	await sidePanel.locator("text=notes.md").click();
	await expect(sidePanel.getByTestId("file-preview")).toContainText(
		"Markdown preview body.",
		{ timeout: 10000 },
	);

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
	const MIN_MP4 =
		"AAAAGGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=";
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