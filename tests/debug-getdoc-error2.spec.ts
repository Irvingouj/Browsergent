import { test } from "@playwright/test";
import { launchExtension, startMockAnthropicServer } from "./helpers";

test("debug get_doc error source", async () => {
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-doc-1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_doc_1", name: "get_doc", input: {} } })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"namespace":"tab","format":"markdown"}' } })}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
				],
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
		],
	});

	const { sidePanel, close } = await launchExtension();

	const messages: string[] = [];
	sidePanel.on("console", (msg) => {
		messages.push(msg.text());
	});

	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByRole("button", { name: "Settings" }).click();
	await sidePanel.locator('input[type="password"]').fill("fake-key");
	await sidePanel.locator('input[type="text"]').nth(0).fill(mock.url);
	await sidePanel.getByRole("button", { name: "Save" }).click();
	await sidePanel.locator('[data-testid="close-session-panel"]').click();

	await sidePanel.locator('input[placeholder="Type a task..."]').fill("check js docs");
	await sidePanel.getByRole("button", { name: "Run" }).click();

	await sidePanel.waitForTimeout(3000);

	console.log("=== CONSOLE MESSAGES ===");
	for (const m of messages) {
		console.log(m);
	}

	await close();
	mock.server.close();
});
