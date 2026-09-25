import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	focusTargetTab,
	launchExtension,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

const PAGE_HTML = `
<!DOCTYPE html>
<html>
<body>
  <button id="apply">Apply side effect</button>
  <div id="status">untouched</div>
  <script>
    document.getElementById("apply").addEventListener("click", () => {
      document.getElementById("status").textContent = "applied";
    });
  </script>
</body>
</html>
`;

function startPageServer(): Promise<{ url: string; server: Server }> {
	return new Promise((resolve) => {
		const server = createServer((_req, res) => {
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(PAGE_HTML);
		});
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			resolve({ url: `http://127.0.0.1:${port}`, server });
		});
	});
}

function runJsChunks(id: string, messageId: string, code: string): string[] {
	return [
		`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: messageId, type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
		`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id, name: "run_js", input: {} } })}\n\n`,
		`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ code }) } })}\n\n`,
		`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
	];
}

test("tree rewind changes chat history without undoing browser side effects", async () => {
	test.setTimeout(90_000);
	const { url, server } = await startPageServer();
	const code = `const d = await page.snapshot_data();
const button = d.nodes.find(n => n.name === "Apply side effect");
if (!button) throw new Error("side-effect button not found");
await page.click({ refId: button.refId });`;
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: runJsChunks("tool-side-effect", "message-side-effect", code),
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "message-final", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Side effect recorded" } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
				],
				delays: [0, 0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});
	const { context, sidePanel, close } = await launchExtension();
	const targetPage = await context.newPage();
	try {
		await targetPage.goto(url);
		await focusTargetTab(targetPage);
		await configureMockProvider(sidePanel, mock.url);
		await focusTargetTab(targetPage);
		await typeTask(sidePanel, "Apply a side effect to the page");
		await sidePanel.getByRole("button", { name: "Run task" }).click();
		await focusTargetTab(targetPage);

		await expect(targetPage.locator("#status")).toHaveText("applied", {
			timeout: 15_000,
		});
		await expect(
			sidePanel
				.getByTestId("chat-message-assistant")
				.filter({ hasText: "Side effect recorded" }),
		).toBeVisible({ timeout: 15_000 });

		await typeTask(sidePanel, "/tree");
		await sidePanel.getByRole("button", { name: "Run task" }).click();
		const tree = sidePanel.getByTestId("transcript-tree-panel");
		await expect(tree).toBeVisible();
		const userEntry = tree
			.getByTestId("transcript-tree-entry")
			.filter({ hasText: "Apply a side effect to the page" })
			.first();
		await userEntry.getByRole("button", { name: "Edit & rewind" }).click();

		await expect(sidePanel.getByTestId("task-input")).toContainText(
			"Apply a side effect to the page",
		);
		await expect(sidePanel.getByTestId("chat-message-assistant")).toHaveCount(
			0,
		);
		await expect(targetPage.locator("#status")).toHaveText("applied");
	} finally {
		server.close();
		mock.server.close();
		await close();
	}
});
