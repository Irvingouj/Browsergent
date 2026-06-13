import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	focusTargetTab,
	launchExtension,
	startMockAnthropicServer,
} from "./helpers";

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

const SNAPSHOT_CODE = "await page.snapshot_data();";

const FILL_CODE = `const data = await page.snapshot_data();
const email = data.nodes.find((n) => n.tag === "input");
await page.fill({ refId: email.refId, value: "test@example.com" });`;

const SUBMIT_CODE = `const data = await page.snapshot_data();
const submit = data.nodes.find((n) => n.tag === "button");
await page.click({ refId: submit.refId });`;

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

test("golden path: agent fills form and submits", async () => {
	test.setTimeout(90000);
	const { url, server } = await startTestServer();
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "m1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tc1", name: "run_js", input: {} } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ code: SNAPSHOT_CODE }) } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
				],
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "m2", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tc2", name: "run_js", input: {} } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ code: FILL_CODE }) } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
				],
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "m3", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tc3", name: "run_js", input: {} } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ code: SUBMIT_CODE }) } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
				],
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
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

	const testPage = await context.newPage();
	await testPage.goto(url);
	await focusTargetTab(testPage);

	await configureMockProvider(sidePanel, mock.url);
	await focusTargetTab(testPage);

	await sidePanel
		.locator('[data-testid="task-input"]')
		.fill("fill the form and submit");
	await focusTargetTab(testPage);
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	await expect(testPage.locator("#email")).toHaveValue("test@example.com", {
		timeout: 30000,
	});
	await expect(testPage.locator("#result")).toHaveText(
		"Submitted: test@example.com",
		{
			timeout: 30000,
		},
	);

	await expect(sidePanel.locator("text=run_js")).toHaveCount(3, {
		timeout: 30000,
	});

	await expect(
		sidePanel.locator("text=Form submitted successfully."),
	).toBeVisible({
		timeout: 10000,
	});

	await expect(sidePanel.locator("text=done")).toBeVisible({ timeout: 30000 });

	expect(mock.requestBodies.length).toBeGreaterThanOrEqual(3);

	server.close();
	await close();
	mock.server.close();
});
