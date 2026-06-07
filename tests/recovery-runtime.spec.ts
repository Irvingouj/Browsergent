import { expect, test } from "@playwright/test";
import { launchExtension, startMockAnthropicServer } from "./helpers";

async function configureMockSettings(sidePanel: any, mockUrl: string) {
  await sidePanel.getByRole("button", { name: "More options" }).click();
  await sidePanel.getByRole("button", { name: "Settings" }).click();
  await sidePanel.locator('input[type="password"]').fill("fake-key");
  await sidePanel.locator('input[type="text"]').nth(0).fill(mockUrl);
  await sidePanel.locator('[data-testid="close-session-panel"]').click();
  await sidePanel.getByRole("button", { name: "Save" }).click();
}

// Multi-turn tool execution is blocked by a WASM core bug where
// hostPrepareToolCalls never returns execute_tools on the second turn.
// See: user note — pi-oxide developer will fix this bug.
// Skip until fix lands.

test.skip("tool timeout — runtime rebuilds and next call succeeds", async () => {
  const mock = startMockAnthropicServer({
    responses: [],
  });
  const { sidePanel, close } = await launchExtension();
  await configureMockSettings(sidePanel, mock.url);

  await sidePanel.locator('input[placeholder="Type a task..."]').fill("slow tool");
  await sidePanel.getByRole("button", { name: "Run" }).click();

  // Trace should show: tool (timeout/error) -> tool (success)
  await expect(sidePanel.locator("text=run_js")).toHaveCount(2, { timeout: 15000 });

  await close();
  mock.server.close();
});

test.skip("runtime corrupted — session rebuilds and health check passes", async () => {
  const mock = startMockAnthropicServer({
    responses: [],
  });
  const { sidePanel, close } = await launchExtension();
  await configureMockSettings(sidePanel, mock.url);

  await sidePanel.locator('input[placeholder="Type a task..."]').fill("crash runtime");
  await sidePanel.getByRole("button", { name: "Run" }).click();

  // Trace should show: tool (error) -> rebuild -> tool (success)
  await expect(sidePanel.locator("text=run_js")).toHaveCount(2, { timeout: 15000 });

  await close();
  mock.server.close();
});
