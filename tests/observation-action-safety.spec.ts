import { createServer } from "node:http";
import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	focusTargetTab,
	launchExtension,
	startMockAnthropicServer,
} from "./helpers";

// Fixture: a button that, when clicked, inserts a child node (childList mutation).
// Under the observation lease, the first click invalidates the lease, so a
// second click against the SAME observation must return E_OBSERVATION_REQUIRED.
const HTML = `
<!DOCTYPE html>
<html>
<body>
  <button id="branch" aria-label="Branch">Branch</button>
  <button id="other" aria-label="Other">Other</button>
  <div id="status">idle</div>
  <script>
    document.getElementById('branch').addEventListener('click', () => {
      const chip = document.createElement('div');
      chip.textContent = 'chipped';
      document.body.appendChild(chip);
      document.getElementById('status').textContent = 'chipped';
    });
    document.getElementById('other').addEventListener('click', () => {
      document.getElementById('status').textContent = 'other_clicked';
    });
  </script>
</body>
</html>
`;

const SNAPSHOT_CODE = "await page.snapshot_data();";

// snapshot → click Branch (adds a child → lease invalidated) → click Other.
// The second click MUST fail with E_OBSERVATION_REQUIRED.
const DOUBLE_CLICK_CODE = `const d = await page.snapshot_data();
const branch = d.nodes.find(n => n.name === "Branch");
const other = d.nodes.find(n => n.name === "Other");
await page.click({ refId: branch.refId });
let secondResult;
try {
  await page.click({ refId: other.refId });
  secondResult = "SECOND_CLICK_SUCCEEDED";
} catch (e) {
  secondResult = String((e && e.message) || e);
}
console.log("SECOND_CLICK_RESULT:" + secondResult);`;

function startServer(): Promise<{ url: string; server: Server }> {
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

function toolUseChunks(id: string, messageId: string, code: string): string[] {
	return [
		`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: messageId, type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
		`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id, name: "run_js", input: {} } })}\n\n`,
		`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ code }) } })}\n\n`,
		`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
	];
}

test("observation-action safety: branching click invalidates lease (E2E)", async () => {
	test.setTimeout(120000);
	const { url, server } = await startServer();

	const mock = startMockAnthropicServer({
		responses: [
			{ chunks: toolUseChunks("tc1", "m1", SNAPSHOT_CODE), delays: [0, 0, 0, 0], stopReason: "tool_use" },
			{ chunks: toolUseChunks("tc2", "m2", DOUBLE_CLICK_CODE), delays: [0, 0, 0, 0], stopReason: "tool_use" },
		],
	});

	const { context, sidePanel, close } = await launchExtension();
	const testPage = await context.newPage();
	await testPage.goto(url);
	await focusTargetTab(testPage);
	await configureMockProvider(sidePanel, mock.url);
	await focusTargetTab(testPage);

	await sidePanel.locator('[data-testid="task-input"]').fill("click branch then other");
	await focusTargetTab(testPage);
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	// Both run_js cells should complete and the agent reports done.
	await expect(sidePanel.locator("text=done").first()).toBeVisible({
		timeout: 60000,
	});

	// The Branch button fired (chip added → status = "chipped").
	await expect(testPage.locator("#status")).toHaveText("chipped", { timeout: 5000 });

	// The Other button must NOT have fired. If the lease failed to invalidate,
	// the second click would have dispatched and set status = "other_clicked".
	// Give the page a brief window for any late dispatch, then assert unchanged.
	await testPage.waitForTimeout(500);
	const statusAfter = await testPage.locator("#status").textContent();
	expect(statusAfter).toBe("chipped");

	server.close();
	await close();
	mock.server.close();
});
