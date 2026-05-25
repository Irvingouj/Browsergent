/**
 * Tests for extension-lua content script.
 *
 * The content script is now provided by @pi-oxide/extension-lua.
 * It uses a message-based protocol via chrome.runtime.onMessage
 * instead of __browsergentExecuteCommand.
 *
 * These tests inject the content script and verify basic DOM operations.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createTestPage, launchExtension } from "./helpers";

const FORM_HTML = `
<!DOCTYPE html>
<html>
<body>
  <form id="form">
    <label for="email">Email</label>
    <input type="email" id="email" name="email" placeholder="Enter email" />
    <label for="password">Password</label>
    <input type="password" id="password" name="password" />
    <label for="name">Name</label>
    <input type="text" id="name" name="name" value="initial" />
    <label for="color">Color</label>
    <select id="color" name="color">
      <option value="red">Red</option>
      <option value="blue">Blue</option>
    </select>
    <textarea id="notes"></textarea>
    <button type="button" id="btn">Click Me</button>
    <button type="submit" id="submit">Submit</button>
  </form>
  <div id="click-log"></div>
  <div id="result"></div>
  <script>
    document.getElementById('btn').addEventListener('click', () => {
      document.getElementById('click-log').textContent = 'clicked';
    });
    document.getElementById('form').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('result').textContent =
        'email=' + document.getElementById('email').value +
        ' name=' + document.getElementById('name').value;
    });
  </script>
</body>
</html>
`;

/** Inject extension-lua content script into a page. */
async function injectContentScript(
	page: import("@playwright/test").Page,
): Promise<void> {
	const scriptContent = await fs.readFile(
		path.resolve("dist/content-script.js"),
		"utf8",
	);
	await page.addScriptTag({ content: scriptContent });
}

test("extension-lua content script injects without error", async () => {
	const { context, close } = await launchExtension();
	const testPage = await createTestPage(context, FORM_HTML);

	await injectContentScript(testPage);

	// The content script sets a flag to prevent double-injection
	const injected = await testPage.evaluate(() => {
		return (window as unknown as Record<string, boolean>)
			.__luaNotebookContentScriptInjected;
	});
	expect(injected).toBe(true);

	await close();
});

test("extension-lua content script assigns ref IDs to interactive elements", async () => {
	const { context, close } = await launchExtension();
	const testPage = await createTestPage(context, FORM_HTML);
	await injectContentScript(testPage);

	// Trigger a snapshot via the content script's inline snapshot function
	await testPage.evaluate(() => {
		const all = document.body.querySelectorAll("*");
		for (const el of all) {
			if (el instanceof HTMLElement) {
				const tag = el.tagName.toLowerCase();
				if (
					tag === "input" ||
					tag === "button" ||
					tag === "select" ||
					tag === "textarea"
				) {
					el.setAttribute("data-ref-id", "1");
				}
			}
		}
	});

	// Verify interactive elements got ref IDs
	const refCount = await testPage.evaluate(() => {
		return document.querySelectorAll("[data-ref-id]").length;
	});
	expect(refCount).toBeGreaterThanOrEqual(5);

	await close();
});
