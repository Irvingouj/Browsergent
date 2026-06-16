import { expect, test } from "@playwright/test";
import { launchExtension, uploadFileViaPanel } from "./helpers";

const MD_CONTENT = "# Preview heading\n\nMarkdown preview body.";

test("files panel shows tabs, previews, and preserves selection across tab switches", async () => {
	test.setTimeout(60000);
	const { sidePanel, close } = await launchExtension();

	await expect(sidePanel.getByRole("button", { name: "Chat" })).toBeVisible();
	await expect(sidePanel.getByRole("button", { name: "Files" })).toBeVisible();
	await expect(sidePanel.getByRole("button", { name: "JS" })).toHaveCount(0);

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await expect(sidePanel.getByTestId("files-panel")).toBeVisible();

	await uploadFileViaPanel(
		sidePanel,
		"image.png",
		"\x89PNG\r\n\x1a\n",
		"image/png",
	);
	await expect(sidePanel.locator("text=image.png")).toBeVisible({
		timeout: 10000,
	});
	await sidePanel.locator("text=image.png").click();
	await expect(sidePanel.getByTestId("file-preview")).toContainText(
		"preview not available",
	);

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
