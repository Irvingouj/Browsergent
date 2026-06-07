import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import { launchExtension } from "./helpers";

const FORM_HTML = `
<!DOCTYPE html>
<html>
<body>
  <input type="text" id="field" name="field" />
</body>
</html>
`;

function startTestServer(): Promise<{
	url: string;
	server: ReturnType<typeof createServer>;
}> {
	return new Promise((resolve) => {
		const server = createServer((_req, res) => {
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(FORM_HTML);
		});
		server.listen(0, () => {
			const address = server.address();
			const port =
				typeof address === "object" && address !== null ? address.port : 0;
			resolve({ url: `http://localhost:${port}`, server });
		});
	});
}

/** Inject extension-js content script into a page. */
async function injectContentScript(
	page: import("@playwright/test").Page,
): Promise<void> {
	const fs = await import("node:fs/promises");
	const path = await import("node:path");
	const scriptContent = await fs.readFile(
		path.resolve("dist/content-script.js"),
		"utf8",
	);
	const plain = scriptContent.replace(/\nexport\s+\{\};\s*$/, "");
	await page.addScriptTag({ content: `(function(){${plain}})()` });
}

test("js playbook fills a form field", async () => {
	const { url, server } = await startTestServer();
	const { context, sidePanel, close } = await launchExtension();

	const testPage = await context.newPage();
	await testPage.goto(url);
	await injectContentScript(testPage);

	// Switch to the JS tab
	await sidePanel.locator("text=JS").click();

	// Type the JS code
	const code = `await page.snapshot();
await page.fill("1", "hello");`;
	await sidePanel.locator('textarea[placeholder="Type JS code..."]').fill(code);

	// Click Run
	await sidePanel.locator("button:has-text('Run')").click();

	// Wait for the field to be filled
	await expect(testPage.locator("#field")).toHaveValue("hello");

	server.close();
	await close();
});
