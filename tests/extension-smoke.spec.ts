import { expect, test } from "@playwright/test";
import { createTestPage, launchExtension } from "./helpers";

test("extension loads and side panel opens", async () => {
	const { sidePanel, close } = await launchExtension();

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

	await sidePanel.locator("text=Settings").click();

	const apiKeyInput = sidePanel.locator('input[type="password"]');
	await expect(apiKeyInput).toBeVisible();

	await apiKeyInput.fill("test-key-123");
	await sidePanel.locator("text=Save").click();

	await expect(sidePanel.locator('input[type="password"]')).not.toBeVisible();

	await sidePanel.locator("text=Settings").click();
	await expect(sidePanel.locator('input[type="password"]')).toHaveValue(
		"test-key-123",
	);

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

	await sidePanel.waitForTimeout(2000);

	await sidePanel.locator("text=Lua").click();
	await sidePanel.locator("textarea").fill('print("hello from lua")');
	await sidePanel.locator("text=Run Lua").click();

	await expect(sidePanel.locator("text=hello from lua")).toBeVisible({
		timeout: 15000,
	});

	await close();
});

test("Lua playbook runs tab.* code and shows output", async () => {
	const { sidePanel, context, close } = await launchExtension();

	await sidePanel.waitForTimeout(2000);

	const testPage = await createTestPage(
		context,
		`<html><body><input id="email" type="text" /></body></html>`,
	);

	await testPage.bringToFront();
	await sidePanel.bringToFront();

	await sidePanel.locator("text=Lua").click();
	const luaCode = 'local id = tab.current()\nprint("tab_id=" .. tostring(id))';
	await sidePanel.locator("textarea").fill(luaCode);
	await sidePanel.locator("text=Run Lua").click();

	await expect(sidePanel.locator("text=tab_id=")).toBeVisible({
		timeout: 15000,
	});

	await close();
});

test("Lua playbook reads tab metadata via tab.* API", async () => {
	const { sidePanel, context, close } = await launchExtension();

	const testPage = await createTestPage(
		context,
		`<!DOCTYPE html>
<html>
  <head><title>Browsergent Metadata Test</title></head>
  <body><h1>Metadata Test</h1></body>
</html>`,
	);

	await testPage.bringToFront();
	await sidePanel.bringToFront();

	await sidePanel.locator("text=Lua").click();
	const luaCode = [
		"local id = tab.current()",
		"local url = tab.url(id)",
		"local title = tab.title(id)",
		"print(url)",
		"print(title)",
	].join("\n");
	await sidePanel.locator("textarea").fill(luaCode);
	await sidePanel.locator("text=Run Lua").click();

	await expect(sidePanel.locator("text=Browsergent Metadata Test")).toBeVisible(
		{
			timeout: 15000,
		},
	);

	await close();
});
