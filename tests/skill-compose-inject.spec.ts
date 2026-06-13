import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	focusTargetTab,
	launchExtension,
	startMockAnthropicServer,
} from "./helpers";

const SIMPLE_HTML = `
<!DOCTYPE html>
<html>
<body>
  <h1>Test Page</h1>
  <p>Hello world</p>
</body>
</html>
`;

const LOAD_SKILL_CODE = JSON.stringify({ skill: "fill-and-submit" });

const M1_START = JSON.stringify({ type: "message_start", message: { id: "m1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } });
const M1_TOOL_START = JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tc1", name: "load_skill", input: {} } });
const M1_TOOL_DELTA = JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: LOAD_SKILL_CODE } });
const M1_TOOL_STOP = JSON.stringify({ type: "content_block_stop", index: 0 });

const M2_START = JSON.stringify({ type: "message_start", message: { id: "m2", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } });
const M2_TEXT_START = JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
const M2_TEXT_DELTA = JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Skill loaded successfully." } });
const M2_TEXT_STOP = JSON.stringify({ type: "content_block_stop", index: 0 });

function startTestServer(): Promise<{
	url: string;
	server: ReturnType<typeof createServer>;
}> {
	return new Promise((resolve) => {
		const server = createServer((_req, res) => {
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(SIMPLE_HTML);
		});
		server.listen(0, () => {
			const address = server.address();
			const port =
				typeof address === "object" && address !== null ? address.port : 0;
			resolve({ url: `http://localhost:${port}`, server });
		});
	});
}

test("compose /skill: injects skill body and agent can load_skill mid-run", async () => {
	test.setTimeout(90000);
	const { url, server } = await startTestServer();
	const mock = startMockAnthropicServer({
		responses: [
			{
				// First turn: assistant calls load_skill for a different skill
				chunks: [
					`event: message_start\ndata: ${M1_START}\n\n`,
					`event: content_block_start\ndata: ${M1_TOOL_START}\n\n`,
					`event: content_block_delta\ndata: ${M1_TOOL_DELTA}\n\n`,
					`event: content_block_stop\ndata: ${M1_TOOL_STOP}\n\n`,
				],
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
			{
				// Second turn: assistant text response after tool result
				chunks: [
					`event: message_start\ndata: ${M2_START}\n\n`,
					`event: content_block_start\ndata: ${M2_TEXT_START}\n\n`,
					`event: content_block_delta\ndata: ${M2_TEXT_DELTA}\n\n`,
					`event: content_block_stop\ndata: ${M2_TEXT_STOP}\n\n`,
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

	// Type skill activation directly in the input
	await sidePanel
		.locator('[data-testid="task-input"]')
		.fill("/skill:capability-check run a check");
	await focusTargetTab(testPage);
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	// Wait for the run to complete
	await expect(sidePanel.locator("text=done")).toBeVisible({ timeout: 30000 });

	// Assert first request body contains the skill XML block
	expect(mock.requestBodies.length).toBeGreaterThanOrEqual(1);
	const firstBody = mock.requestBodies[0];
	expect(firstBody).toBeDefined();
	expect(typeof firstBody).toBe("object");
	expect(firstBody).not.toBeNull();

	const messages = (firstBody as Record<string, unknown>).messages;
	expect(Array.isArray(messages)).toBe(true);

	function isUserMessage(m: unknown): m is Record<string, unknown> {
		return typeof m === "object" && m !== null && "role" in m && m.role === "user";
	}
	const userMessages = (messages as unknown[]).filter(isUserMessage);
	expect(userMessages.length).toBeGreaterThanOrEqual(1);

	const firstUserMessage = userMessages[0];
	const content = firstUserMessage.content;
	let textContent: string;
	if (typeof content === "string") {
		textContent = content;
	} else if (Array.isArray(content)) {
		textContent = content
			.map((c: unknown) => {
				if (typeof c === "object" && c !== null && "text" in c) {
					return (c as Record<string, unknown>).text ?? "";
				}
				return "";
			})
			.join("");
	} else {
		expect.fail(`Unexpected content type: ${typeof content}`);
	}
	expect(textContent).toContain('<skill name="capability-check"');

	// Assert trace entry shows load_skill tool call
	await expect(sidePanel.locator("text=load_skill")).toBeVisible({
		timeout: 30000,
	});

	// Assert assistant text after load_skill
	await expect(
		sidePanel.locator("text=Skill loaded successfully."),
	).toBeVisible({
		timeout: 10000,
	});

	server.close();
	await close();
	mock.server.close();
});
