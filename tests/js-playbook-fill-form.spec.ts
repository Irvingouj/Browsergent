import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import { focusTargetTab, launchExtension } from "./helpers";

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

test("js playbook fills a form field", async () => {
	const { url, server } = await startTestServer();
	const { context, sidePanel, close } = await launchExtension();

	const testPage = await context.newPage();
	await testPage.goto(url);
	await focusTargetTab(testPage);

	await sidePanel.locator("text=JS").click();

	const code = `const data = await page.snapshot_data();
const input = data.nodes.find((el) => el.tag === "input");
await page.fill({ refId: input.refId, value: "hello" });`;
	await sidePanel.locator('textarea[placeholder="Type JS code..."]').fill(code);

	await focusTargetTab(testPage);
	await sidePanel.locator("button:has-text('Run')").click();

	await expect(testPage.locator("#field")).toHaveValue("hello", {
		timeout: 15000,
	});

	server.close();
	await close();
});
