import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import { launchExtension, startMockAnthropicServer } from "./helpers";

const FORM_HTML = `
<!DOCTYPE html>
<html>
<body>
  <form id="form">
    <input type="email" id="email" name="email" />
    <button type="submit">Submit</button>
  </form>
  <div id="result"></div>
  <script>
    document.getElementById('form').addEventListener('submit', function(e) {
      e.preventDefault();
      document.getElementById('result').textContent = 'Submitted: ' + document.getElementById('email').value;
    });
  </script>
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

// Skipped: WASM core (@pi-oxide/pi-host-web) multi-turn bug —
// hostPrepareToolCalls never returns execute_tools on the second turn.
// pi-oxide developer will fix this bug. Re-enable after fix lands.
// See: user note — "let's take a step back, fix other work unit first".
test.skip("golden path: agent fills form and submits", async () => {
	const { url, server } = await startTestServer();
	const mock = startMockAnthropicServer({
		responses: [
			// Turn 1: agent calls snapshot
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "m1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tc1", name: "run_js", input: {} } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ code: "await page.snapshot();" }) } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
				],
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
			// Turn 2: agent fills email
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "m2", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tc2", name: "run_js", input: {} } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ code: 'await page.fill("1", "test@example.com");' }) } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
				],
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
			// Turn 3: agent clicks submit
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "m3", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tc3", name: "run_js", input: {} } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ code: 'await page.click("2");' }) } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
				],
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
			// Turn 4: agent confirms completion
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "m4", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Form submitted successfully." } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
				],
				delays: [0, 0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});

	const { context, sidePanel, close } = await launchExtension();

	// Open test page and inject content script
	const testPage = await context.newPage();
	await testPage.goto(url);
	await injectContentScript(testPage);

	// Configure mock provider
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.locator('input[type="password"]').fill("test-key");
	await sidePanel.locator('input[type="text"]').nth(0).fill(mock.url);
	await sidePanel.locator('[data-testid="close-session-panel"]').click();
	await sidePanel.getByRole("button", { name: "Save" }).click();
	await expect(sidePanel.locator('input[type="password"]')).not.toBeVisible();

	// Start agent
	await sidePanel
		.locator('input[placeholder="Type a task..."]')
		.fill("fill the form and submit");
	await sidePanel.getByRole("button", { name: "Run" }).click();

	// Assert trace shows actions
	await expect(sidePanel.locator("text=run_js")).toHaveCount(3, { timeout: 15000 });

	// Assert form is filled
	await expect(testPage.locator("#email")).toHaveValue("test@example.com");

	// Assert form submitted
	await expect(testPage.locator("#result")).toHaveText("Submitted: test@example.com");

	// Assert agent completion message
	await expect(sidePanel.locator("text=Form submitted successfully.")).toBeVisible({
		timeout: 10000,
	});

	await expect(sidePanel.locator("text=done")).toBeVisible({ timeout: 10000 });

	server.close();
	await close();
	mock.server.close();
});
