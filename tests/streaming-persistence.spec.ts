import { test, expect } from "@playwright/test";
import { launchExtension, startMockAnthropicServer } from "./helpers";

test("mocked streaming emits delayed chunks and partial text appears before final chunk", async () => {
  const mock = startMockAnthropicServer({
    responses: [
      {
        chunks: [
          `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
          `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
          `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } })}\n\n`,
          `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " world" } })}\n\n`,
          `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
        ],
        delays: [0, 0, 50, 500, 0],
        stopReason: "end_turn",
      },
    ],
  });

  const { sidePanel, close } = await launchExtension();
  await sidePanel.getByRole("button", { name: "Settings" }).click();
  await sidePanel.locator('input[type="password"]').fill("fake-key");
  await sidePanel.locator('input[type="text"]').nth(0).fill(mock.url);
  await sidePanel.getByRole("button", { name: "Save" }).click();

  await sidePanel.locator('input[placeholder="Type a task..."]').fill("say hello");
  await sidePanel.getByRole("button", { name: "Run" }).click();

  await expect(sidePanel.locator("text=Hello")).toBeVisible({ timeout: 5000 });
  await expect(sidePanel.locator("text=Hello world")).toHaveCount(0);
  await expect(sidePanel.locator("text=Hello world")).toBeVisible({ timeout: 10000 });

  await close();
  mock.server.close();
});

test("final streamed response is one assistant message", async () => {
  const mock = startMockAnthropicServer({
    responses: [
      {
        chunks: [
          `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-2", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
          `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
          `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Single assistant message" } })}\n\n`,
          `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
        ],
        delays: [0, 0, 100, 0],
        stopReason: "end_turn",
      },
    ],
  });

  const { sidePanel, close } = await launchExtension();
  await sidePanel.getByRole("button", { name: "Settings" }).click();
  await sidePanel.locator('input[type="password"]').fill("fake-key");
  await sidePanel.locator('input[type="text"]').nth(0).fill(mock.url);
  await sidePanel.getByRole("button", { name: "Save" }).click();

  await sidePanel.locator('input[placeholder="Type a task..."]').fill("one message");
  await sidePanel.getByRole("button", { name: "Run" }).click();

  await expect(sidePanel.locator("text=Single assistant message")).toBeVisible({ timeout: 5000 });
  await expect(sidePanel.locator('[data-testid="chat-message-assistant"]')).toHaveCount(1);

  await close();
  mock.server.close();
});

test("two prompts keep all messages visible and prior transcript included in second provider request", async () => {
  const mock = startMockAnthropicServer({
    responses: [
      {
        chunks: [
          `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-3", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
          `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
          `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "First response" } })}\n\n`,
          `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
        ],
        delays: [0, 0, 100, 0],
        stopReason: "end_turn",
      },
      {
        chunks: [
          `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-4", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
          `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
          `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Second response" } })}\n\n`,
          `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
        ],
        delays: [0, 0, 100, 0],
        stopReason: "end_turn",
      },
    ],
  });

  const { sidePanel, close } = await launchExtension();
  await sidePanel.getByRole("button", { name: "Settings" }).click();
  await sidePanel.locator('input[type="password"]').fill("fake-key");
  await sidePanel.locator('input[type="text"]').nth(0).fill(mock.url);
  await sidePanel.getByRole("button", { name: "Save" }).click();

  await sidePanel.locator('input[placeholder="Type a task..."]').fill("task one");
  await sidePanel.getByRole("button", { name: "Run" }).click();
  await expect(sidePanel.locator("text=First response")).toBeVisible({ timeout: 5000 });

  await sidePanel.locator('input[placeholder="Type a task..."]').fill("task two");
  await sidePanel.getByRole("button", { name: "Run" }).click();
  await expect(sidePanel.locator("text=Second response")).toBeVisible({ timeout: 5000 });

  await expect(sidePanel.locator('[data-testid="chat-message-user"]')).toHaveCount(2);
  await expect(sidePanel.locator('[data-testid="chat-message-assistant"]')).toHaveCount(2);

  expect(mock.requestBodies.length).toBe(2);
  const secondRequest = mock.requestBodies[1] as {
    messages: Array<{ role: string; content: string }>;
  };
  expect(secondRequest.messages).toEqual([
    { role: "user", content: "task one" },
    { role: "assistant", content: "First response" },
    { role: "user", content: "task two" },
  ]);

  await close();
  mock.server.close();
});

test("stop preserves partial streamed text", async () => {
  const mock = startMockAnthropicServer({
    responses: [
      {
        chunks: [
          `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-5", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
          `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
          `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Partial" } })}\n\n`,
          `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " never finishes" } })}\n\n`,
        ],
        delays: [0, 0, 50, 10000],
        stopReason: "end_turn",
      },
    ],
  });

  const { sidePanel, close } = await launchExtension();
  await sidePanel.getByRole("button", { name: "Settings" }).click();
  await sidePanel.locator('input[type="password"]').fill("fake-key");
  await sidePanel.locator('input[type="text"]').nth(0).fill(mock.url);
  await sidePanel.getByRole("button", { name: "Save" }).click();

  await sidePanel.locator('input[placeholder="Type a task..."]').fill("stop me");
  await sidePanel.getByRole("button", { name: "Run" }).click();

  await expect(sidePanel.locator("text=Partial")).toBeVisible({ timeout: 5000 });

  await sidePanel.getByRole("button", { name: "Stop" }).click();
  await expect(sidePanel.locator("text=Status: stopped")).toBeVisible({ timeout: 5000 });

  await expect(sidePanel.locator("text=Partial")).toBeVisible();

  await close();
  mock.server.close();
});
