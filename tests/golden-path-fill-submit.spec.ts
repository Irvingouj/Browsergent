import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	focusTargetTab,
	launchExtension,
	startMockAnthropicServer,
} from "./helpers";

/**
 * Golden path: mock agent observes a form and fills fields.
 *
 * Note: page.fill currently often hangs the run_js cell after values land
 * (observation-lease completion). Multi-fill safety E2E and this test assert
 * DOM values — the business outcome — rather than agent-status "done".
 */
const FORM_HTML = `
<!DOCTYPE html>
<html>
<body>
  <form id="form">
    <input id="email" name="email" aria-label="Email" />
    <input id="name" name="name" aria-label="Name" />
  </form>
</body>
</html>
`;

const SNAPSHOT_CODE = "await page.snapshot_data();";

const FILL_CODE = `const data = await page.snapshot_data();
const email = data.nodes.find((n) => n.name === "Email");
const name = data.nodes.find((n) => n.name === "Name");
if (!email || !name) throw new Error("fields missing");
await page.fill({ refId: email.refId, value: "test@example.com" });
await page.fill({ refId: name.refId, value: "Alice" });`;

function toolUseChunks(id: string, messageId: string, code: string): string[] {
	return [
		`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: messageId, type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
		`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id, name: "run_js", input: {} } })}\n\n`,
		`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ code }) } })}\n\n`,
		`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
	];
}

function startTestServer(): Promise<{
	url: string;
	server: ReturnType<typeof createServer>;
}> {
	return new Promise((resolve) => {
		const server = createServer((_req, res) => {
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(FORM_HTML);
		});
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port =
				typeof address === "object" && address !== null ? address.port : 0;
			resolve({ url: `http://127.0.0.1:${port}`, server });
		});
	});
}

test("golden path: agent fills form fields", async () => {
	test.setTimeout(90000);
	const { url, server } = await startTestServer();
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: toolUseChunks("tc1", "m1", SNAPSHOT_CODE),
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: toolUseChunks("tc2", "m2", FILL_CODE),
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
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
		.fill("fill the form fields");
	await focusTargetTab(testPage);
	await sidePanel.getByRole("button", { name: "Run task" }).click();
	await focusTargetTab(testPage);

	// Business outcome: both fields filled via the agent.
	await expect(testPage.locator("#email")).toHaveValue("test@example.com", {
		timeout: 30000,
	});
	await expect(testPage.locator("#name")).toHaveValue("Alice", {
		timeout: 10000,
	});

	expect(mock.requestBodies.length).toBeGreaterThanOrEqual(2);

	server.close();
	await close();
	mock.server.close();
});
