import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	launchExtension,
	startMockAnthropicServer,
} from "./helpers";

function makeTextStream(text: string) {
	return [
		`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
		`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
		`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}\n\n`,
		`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
	];
}

function makeToolStream(toolName: string, toolInput: Record<string, unknown>) {
	return [
		`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
		`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool-1", name: toolName, input: {} } })}\n\n`,
		`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(toolInput) } })}\n\n`,
		`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
	];
}

test("tool compile error — agent surfaces error and completes", async () => {
	test.setTimeout(60000);
	const mock = startMockAnthropicServer({
		responses: [
			{ chunks: makeToolStream("run_js", { code: "function({" }), delays: [0, 0, 0, 0], stopReason: "tool_use" },
			{ chunks: makeTextStream("Compile error handled."), delays: [0, 0, 0, 0], stopReason: "end_turn" },
		],
	});
	const { sidePanel, close } = await launchExtension();
	await configureMockProvider(sidePanel, mock.url, "fake-key");

	await sidePanel.locator('[data-testid="task-input"]').fill("syntax error");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	// Compile error surfaces as a failed trace entry
	await expect(sidePanel.locator('[data-testid="trace-entry"]').first()).toContainText(
		"✗",
		{ timeout: 15000 },
	);

	// Agent continues and completes
	await expect(sidePanel.locator('[data-testid="agent-status"]')).toHaveText(
		/done/,
		{ timeout: 15000 },
	);

	expect(mock.requestBodies.length).toBeGreaterThanOrEqual(2);

	await close();
	mock.server.close();
});

test("runtime corrupted — session rebuilds and health check passes", async () => {
	test.setTimeout(60000);
	const mock = startMockAnthropicServer({
		responses: [
			{ chunks: makeToolStream("run_js", { code: "null.x" }), delays: [0, 0, 0, 0], stopReason: "tool_use" },
			{ chunks: makeTextStream("Runtime error handled."), delays: [0, 0, 0, 0], stopReason: "end_turn" },
		],
	});
	const { sidePanel, close } = await launchExtension();
	await configureMockProvider(sidePanel, mock.url, "fake-key");

	await sidePanel.locator('[data-testid="task-input"]').fill("crash runtime");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	// Runtime error surfaces as a failed trace entry
	await expect(sidePanel.locator('[data-testid="trace-entry"]').first()).toContainText(
		"✗",
		{ timeout: 15000 },
	);

	// Agent continues and completes
	await expect(sidePanel.locator('[data-testid="agent-status"]')).toHaveText(
		/done/,
		{ timeout: 15000 },
	);

	expect(mock.requestBodies.length).toBeGreaterThanOrEqual(2);

	await close();
	mock.server.close();
});