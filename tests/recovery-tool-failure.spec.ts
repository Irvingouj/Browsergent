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

test.skip("tool stale ref — retry after fresh snapshot", async () => {
  const mock = startMockAnthropicServer({
    responses: [],
  });
  const { sidePanel, close } = await launchExtension();
  await configureMockSettings(sidePanel, mock.url);

  await sidePanel.locator('input[placeholder="Type a task..."]').fill("click stale");
  await sidePanel.getByRole("button", { name: "Run" }).click();

  // Trace should show: snapshot -> click (error) -> snapshot -> click (success)
  // This requires the WASM core to execute a second turn.
  await expect(sidePanel.locator("text=run_js")).toHaveCount(4, { timeout: 15000 });

  await close();
  mock.server.close();
});
