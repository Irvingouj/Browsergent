/**
 * Tests for extension-js content script.
 *
 * The content script is now provided by @pi-oxide/extension-js.
 * It uses a message-based protocol via chrome.runtime.onMessage
 * instead of __browsergentExecuteCommand.
 *
 * These tests inject the content script and verify basic DOM operations.
 */

import { expect, test } from "@playwright/test";
import {
	createTestPage,
	injectContentScript,
	launchExtension,
	mockChromeRuntimeOnMessage,
} from "./helpers";

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

test("extension-js content script injects without error", async () => {
	const { context, close } = await launchExtension();
	const testPage = await createTestPage(context, FORM_HTML);

	await injectContentScript(testPage);

	// The content script sets a flag to prevent double-injection
	const injected = await testPage.evaluate(() => {
		return (window as unknown as Record<string, boolean>)
			.__jsNotebookContentScriptInjected;
	});
	expect(injected).toBe(true);

	await close();
});

test("extension-js content script assigns ref IDs to interactive elements", async () => {
	const { context, close } = await launchExtension();
	const testPage = await createTestPage(context, FORM_HTML);

	// Mock chrome.runtime before injecting the content script
	const dispatch = await mockChromeRuntimeOnMessage(testPage);
	await injectContentScript(testPage);

	// Trigger the snapshot via the registered listener
	await dispatch("page_snapshot_data");

	// Verify interactive elements got real ref IDs matching /^e\d+$/
	const refIds = await testPage.evaluate(() => {
		const elements = document.querySelectorAll<HTMLElement>(
			"input, button, select, textarea",
		);
		return Array.from(elements).map((el) => el.getAttribute("data-ref-id"));
	});

	expect(refIds.length).toBeGreaterThanOrEqual(5);
	for (const refId of refIds) {
		expect(refId).toMatch(/^e\d+$/);
	}

	await close();
});
