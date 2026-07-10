import { test, expect } from "@playwright/test";
import {
  configureMockProvider,
  domClickTestId,
  launchExtension,
  startMockAnthropicServer,
  typeTask,
} from "./helpers";

function makeQuickChunk(text: string) {
  return (
    `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: `msg-${text}`, type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n` +
    `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n` +
    `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}\n\n` +
    `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`
  );
}

test("single panel mock run via mock poll", async () => {
  test.setTimeout(120000);
  const mock = startMockAnthropicServer({
    responses: [{ chunks: [makeQuickChunk("Reply A")], delays: [0,0,0,0], stopReason: "end_turn" }],
  });
  const { sidePanel, close } = await launchExtension();
  try {
    await configureMockProvider(sidePanel, mock.url);
    await typeTask(sidePanel, "hello");
    await domClickTestId(sidePanel, "run-button");
    // Node-side poll — no CDP during agent-worker spawn
    await expect.poll(() => mock.requestBodies.length, { timeout: 90_000 }).toBeGreaterThan(0);
    console.log("mock got", mock.requestBodies.length);
    // Give UI a moment then try body
    await new Promise(r => setTimeout(r, 2000));
    const body = await sidePanel.evaluate(() => document.body.innerText).catch(e => `eval fail ${e}`);
    console.log("body", String(body).slice(0, 300));
    expect(String(body)).toContain("Reply A");
  } finally {
    await Promise.race([close(), new Promise(r => setTimeout(r, 10000))]);
    mock.server.close();
  }
});
