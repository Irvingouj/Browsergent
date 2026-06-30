import type { Server } from "node:http";
import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	focusTargetTab,
	launchExtension,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

// Fixture: clicking Swap replaces the Target button with a new one (same
// name/role but different DOM node), invalidating the old refId. The agent
// must re-snapshot and click the fresh refId.
const HTML = `
<!DOCTYPE html>
<html>
<body>
  <button id="swap" aria-label="Swap">Swap</button>
  <div id="target-container"><button id="target" aria-label="Target">Target</button></div>
  <div id="status">idle</div>
  <script>
    document.getElementById('swap').addEventListener('click', () => {
      var c = document.getElementById('target-container');
      c.innerHTML = '<button id="target2" aria-label="Target">Target</button>';
      document.getElementById('target2').addEventListener('click', function() {
        document.getElementById('status').textContent = 'target_clicked';
      });
      document.getElementById('status').textContent = 'swapped';
    });
    document.getElementById('target').addEventListener('click', function() {
      document.getElementById('status').textContent = 'target_clicked';
    });
  </script>
</body>
</html>
`;

const SNAPSHOT_AND_STORE = `const d = await page.snapshot_data();
globalThis._bg = {
  swapRef: d.nodes.find(n => n.name === "Swap").refId,
  targetRef: d.nodes.find(n => n.name === "Target").refId
};`;

const CLICK_SWAP = `await page.click({ refId: globalThis._bg.swapRef });`;
const CLICK_STALE = `await page.click({ refId: globalThis._bg.targetRef });`;
const RESNAPSHOT_AND_CLICK = `const d2 = await page.snapshot_data();
var t = d2.nodes.find(n => n.name === "Target");
await page.click({ refId: t.refId });`;

function makeToolStream(code: string): string[] {
	return [
		`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
		`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool-1", name: "run_js", input: {} } })}\n\n`,
		`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ code }) } })}\n\n`,
		`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
	];
}

function makeTextStream(text: string): string[] {
	return [
		`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
		`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
		`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}\n\n`,
		`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
	];
}

function startFixtureServer(): Promise<{ url: string; server: Server }> {
	return new Promise((resolve) => {
		const server = createServer((_req, res) => {
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(HTML);
		});
		server.listen(0, () => {
			const addr = server.address();
			const port = typeof addr === "object" && addr ? addr.port : 0;
			resolve({ url: `http://localhost:${port}`, server });
		});
	});
}

test("tool stale ref — retry after fresh snapshot", async () => {
	test.setTimeout(120000);

	const { url, server: fixtureSrv } = await startFixtureServer();

	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: makeToolStream(SNAPSHOT_AND_STORE),
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: makeToolStream(CLICK_SWAP),
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: makeToolStream(CLICK_STALE),
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: makeToolStream(RESNAPSHOT_AND_CLICK),
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: makeTextStream("Done."),
				delays: [0, 0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});

	const { context, sidePanel, close } = await launchExtension();
	const testPage = await context.newPage();
	await testPage.goto(url);
	await focusTargetTab(testPage);
	await configureMockProvider(sidePanel, mock.url, "fake-key");
	await focusTargetTab(testPage);

	await typeTask(sidePanel, "click stale");
	await focusTargetTab(testPage);
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	// The final click on the fresh refId sets status to "target_clicked"
	await expect(testPage.locator("#status")).toHaveText("target_clicked", {
		timeout: 30000,
	});

	// Agent completes
	await expect(sidePanel.locator('[data-testid="agent-status"]')).toHaveText(
		/done/,
		{ timeout: 15000 },
	);

	expect(mock.requestBodies.length).toBeGreaterThanOrEqual(4);

	fixtureSrv.close();
	await close();
	mock.server.close();
});
