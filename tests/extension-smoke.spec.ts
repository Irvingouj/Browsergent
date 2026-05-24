import { test, expect } from "@playwright/test";
import { launchExtension, createTestPage } from "./helpers";

test("extension loads and side panel opens", async () => {
  const { sidePanel, close } = await launchExtension();
  
  // Check side panel has the Browsergent UI
  await expect(sidePanel.locator("text=Chat")).toBeVisible();
  await expect(sidePanel.locator("text=Lua")).toBeVisible();
  await expect(sidePanel.locator("text=Settings")).toBeVisible();
  
  await close();
});

test("side panel has task input and run button", async () => {
  const { sidePanel, close } = await launchExtension();
  
  const input = sidePanel.locator('input[placeholder="Type a task..."]');
  await expect(input).toBeVisible();
  
  const runButton = sidePanel.locator("text=Run");
  await expect(runButton).toBeVisible();
  
  await close();
});

test("settings panel stores API key", async () => {
  const { sidePanel, close } = await launchExtension();
  
  // Open settings
  await sidePanel.locator("text=Settings").click();
  
  // Should show API key input
  const apiKeyInput = sidePanel.locator('input[type="password"]');
  await expect(apiKeyInput).toBeVisible();
  
  // Type a key and save
  await apiKeyInput.fill("test-key-123");
  await sidePanel.locator("text=Save").click();
  
  // Settings should close
  await expect(sidePanel.locator('input[type="password"]')).not.toBeVisible();
  
  // Reopen and verify key is there
  await sidePanel.locator("text=Settings").click();
  await expect(sidePanel.locator('input[type="password"]')).toHaveValue("test-key-123");
  
  await close();
});

test("Lua tab shows editor", async () => {
  const { sidePanel, close } = await launchExtension();
  
  await sidePanel.locator("text=Lua").click();
  
  await expect(sidePanel.locator("text=Lua Playbook")).toBeVisible();
  await expect(sidePanel.locator("text=Run Lua")).toBeVisible();
  
  await close();
});

test("Lua tab runs a basic playbook", async () => {
  const { sidePanel, close } = await launchExtension();

  // Give Worker time to initialize WASM
  await sidePanel.waitForTimeout(2000);

  await sidePanel.locator("text=Lua").click();
  await sidePanel.locator("textarea").fill('print("hello from lua")');
  await sidePanel.locator("text=Run Lua").click();

  await expect(sidePanel.locator("text=hello from lua")).toBeVisible({ timeout: 15000 });

  await close();
});

test("Lua playbook emits typed browser command trace", async () => {
  const { sidePanel, context, close } = await launchExtension();

  // Give the Worker time to initialize WASM
  await sidePanel.waitForTimeout(2000);

  // Create a test page so there's a target tab for browser commands
  const testPage = await createTestPage(context, `
    <html><body>
      <input id="email" type="text" />
    </body></html>
  `);

  // Focus the test page so content script can be injected
  await testPage.bringToFront();
  await sidePanel.bringToFront();

  await sidePanel.locator("text=Lua").click();
  await sidePanel.locator("textarea").fill('page.fill("e0", "test@example.com")');
  await sidePanel.locator("text=Run Lua").click();

  // Wait for trace to appear
  await expect(sidePanel.locator("text=page.fill")).toBeVisible({ timeout: 15000 });

  await close();
});
