import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	launchExtension,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

function sseEvent(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function textResponse(messageId: string, text: string): string[] {
	return [
		sseEvent("message_start", {
			type: "message_start",
			message: {
				id: messageId,
				type: "message",
				role: "assistant",
				content: [],
				model: "test",
				stop_reason: null,
				usage: { input_tokens: 10, output_tokens: 0 },
			},
		}),
		sseEvent("content_block_start", {
			type: "content_block_start",
			index: 0,
			content_block: { type: "text", text: "" },
		}),
		sseEvent("content_block_delta", {
			type: "content_block_delta",
			index: 0,
			delta: { type: "text_delta", text },
		}),
		sseEvent("content_block_stop", {
			type: "content_block_stop",
			index: 0,
		}),
	];
}

function failedPartialToolCallResponse(): string[] {
	return [
		sseEvent("message_start", {
			type: "message_start",
			message: {
				id: "msg-partial-tool-failure",
				type: "message",
				role: "assistant",
				content: [],
				model: "test",
				stop_reason: null,
				usage: { input_tokens: 10, output_tokens: 0 },
			},
		}),
		sseEvent("content_block_start", {
			type: "content_block_start",
			index: 0,
			content_block: {
				type: "tool_use",
				id: "toolu_failed_partial",
				name: "run_js",
				input: {},
			},
		}),
		sseEvent("content_block_delta", {
			type: "content_block_delta",
			index: 0,
			delta: {
				type: "input_json_delta",
				partial_json: '{"code":"print(',
			},
		}),
	];
}

function messagesFromRequest(body: unknown): readonly unknown[] {
	if (typeof body !== "object" || body === null) {
		throw new Error("Expected provider request body object");
	}
	const messages = (body as Record<string, unknown>).messages;
	if (!Array.isArray(messages)) {
		throw new Error("Expected provider request messages array");
	}
	return messages;
}

test("agent shows provider error and UI remains usable", async () => {
	const mock = startMockAnthropicServer({ responses: [] });

	mock.server.removeAllListeners("request");
	mock.server.on("request", (req, res) => {
		if (req.method === "OPTIONS") {
			res.writeHead(204, {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Headers":
					"content-type, x-api-key, anthropic-version, authorization",
				"Access-Control-Allow-Methods": "POST",
			});
			res.end();
			return;
		}
		if (req.url === "/v1/messages" && req.method === "POST") {
			res.writeHead(401, {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": "*",
			});
			res.end(
				JSON.stringify({
					error: { type: "authentication_error", message: "Invalid API key" },
				}),
			);
		} else {
			res.writeHead(404);
			res.end();
		}
	});

	const { sidePanel, close } = await launchExtension();

	await configureMockProvider(sidePanel, mock.url);

	// Start a run
	await typeTask(sidePanel, "test 401");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	// Should show error status (hard stop)
	await expect(sidePanel.getByText("error", { exact: true })).toBeVisible({
		timeout: 10000,
	});

	// UI should remain usable — Run button visible
	await expect(
		sidePanel.getByRole("button", { name: "Run task" }),
	).toBeVisible();

	await close();
	mock.server.close();
});

test("failed partial tool call does not poison the next provider request", async () => {
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: failedPartialToolCallResponse(),
				delays: [0, 0, 0],
				stopReason: "error",
			},
			{
				chunks: textResponse("msg-after-partial-tool-failure", "Recovered."),
				delays: [0, 0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});

	const { sidePanel, close } = await launchExtension();
	try {
		await configureMockProvider(sidePanel, mock.url);

		await typeTask(sidePanel, "trigger partial tool failure");
		await sidePanel.getByRole("button", { name: "Run task" }).click();
		await expect(sidePanel.getByText("error", { exact: true })).toBeVisible({
			timeout: 10000,
		});

		await typeTask(sidePanel, "recover after provider failure");
		await sidePanel.getByRole("button", { name: "Run task" }).click();
		await expect(sidePanel.locator("text=Recovered.")).toBeVisible({
			timeout: 10000,
		});

		expect(mock.requestBodies.length).toBe(2);
		const secondRequestMessages = messagesFromRequest(mock.requestBodies[1]);
		const secondRequestHistory = JSON.stringify(secondRequestMessages);
		expect(secondRequestHistory).not.toContain("toolu_failed_partial");
		expect(secondRequestHistory).not.toContain('"role":"assistant"');
		expect(secondRequestHistory).toContain("recover after provider failure");
	} finally {
		await close();
		mock.server.close();
	}
});
