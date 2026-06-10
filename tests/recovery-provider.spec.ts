import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import { launchExtension, startMockAnthropicServer } from "./helpers";

async function configureMockSettings(sidePanel: any, mockUrl: string) {
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByRole("button", { name: "Open settings" }).click();
	await sidePanel.locator('input[type="password"]').fill("fake-key");
	await sidePanel.locator('input[type="text"]').nth(0).fill(mockUrl);
	await sidePanel.getByRole("button", { name: "Save settings" }).click();
	await sidePanel.locator('[data-testid="close-session-panel"]').click();
	await expect(sidePanel.getByTestId("new-session-button")).not.toBeVisible();
}

function makeTextStream(text: string) {
	return (
		`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n` +
		`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n` +
		`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}\n\n` +
		`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`
	);
}

test("provider bad stream", async () => {
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: ["invalid json\n\n"],
				delays: [0],
				stopReason: "end_turn",
			},
		],
	});
	const { sidePanel, close } = await launchExtension();
	await configureMockSettings(sidePanel, mock.url);

	await sidePanel
		.locator('input[data-testid="task-input"]')
		.fill("bad stream");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	await expect(sidePanel.locator('[data-testid="agent-status"]')).toHaveText(
		/error/,
		{ timeout: 10000 },
	);

	await close();
	mock.server.close();
});

test("provider weak network recovers after retry", async () => {
	const requestBodies: unknown[] = [];
	let requestCount = 0;
	const server = createServer((req, res) => {
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
			let body = "";
			req.on("data", (chunk) => {
				body += chunk;
			});
			req.on("end", () => {
				try {
					requestBodies.push(JSON.parse(body));
				} catch {
					requestBodies.push(body);
				}
				requestCount++;
				if (requestCount === 1) {
					res.writeHead(503, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "overloaded" }));
					return;
				}
				const chunk = makeTextStream("Recovered");
				res.writeHead(200, {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					"Access-Control-Allow-Origin": "*",
				});
				res.write(chunk);
				res.write(
					`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 0 } })}\n\n`,
				);
				res.write(
					`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
				);
				res.end();
			});
		} else {
			res.writeHead(404);
			res.end();
		}
	});
	server.listen(0);
	const address = server.address();
	const port =
		typeof address === "object" && address !== null ? address.port : 0;
	const mockUrl = `http://localhost:${port}`;

	const { sidePanel, close } = await launchExtension();
	await configureMockSettings(sidePanel, mockUrl);

	await sidePanel
		.locator('input[data-testid="task-input"]')
		.fill("retry task");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	await expect(sidePanel.locator("text=Recovered")).toBeVisible({
		timeout: 15000,
	});

	await close();
	server.close();
});
