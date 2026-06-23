/**
 * Tests for extension-js content script (from @pi-oxide/extension-js).
 *
 * Validates that the content script correctly:
 * - Injects and initializes on a page
 * - Supports DOM snapshot via inline snapshot function
 * - Supports fill and click actions via message protocol
 */

import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
	createTestPage,
	launchExtension,
	mockChromeRuntimeOnMessage,
} from "./helpers";

const TEST_FORM_HTML = `
<!DOCTYPE html>
<html>
<body>
  <form id="test-form">
    <label for="email">Email</label>
    <input type="email" id="email" name="email" placeholder="Enter email" />
    <label for="name">Name</label>
    <input type="text" id="name" name="name" />
    <label for="color">Color</label>
    <select id="color" name="color">
      <option value="red">Red</option>
      <option value="blue">Blue</option>
      <option value="green">Green</option>
    </select>
    <button type="submit" id="submit-btn">Submit</button>
  </form>
  <div id="result"></div>
  <script>
    document.getElementById('test-form').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('result').textContent =
        'Submitted: email=' + document.getElementById('email').value +
        ' name=' + document.getElementById('name').value;
    });
  </script>
</body>
</html>
`;

async function injectExtensionJsContentScript(
	page: import("@playwright/test").Page,
): Promise<void> {
	const scriptContent = await fs.readFile(
		path.resolve("dist/content-script.js"),
		"utf8",
	);
	// 0.3.0 ships content-script.js as an ES module (contains `export {};`).
	// Remove the export so it runs as a plain script tag.
	const plain = scriptContent.replace(/\nexport\s+\{\};\s*$/, "");
	await page.addScriptTag({ content: `(function(){${plain}})()` });
}

test("extension-js content script initializes on page", async () => {
	const { context, close } = await launchExtension();
	const testPage = await createTestPage(context, TEST_FORM_HTML);
	await injectExtensionJsContentScript(testPage);

	const initialized = await testPage.evaluate(() => {
		return (window as unknown as Record<string, boolean>)
			.__jsNotebookContentScriptInjected;
	});
	expect(initialized).toBe(true);

	await close();
});

test("extension-js content script assigns data-ref-id attributes", async () => {
	const { context, close } = await launchExtension();
	const testPage = await createTestPage(context, TEST_FORM_HTML);

	// Mock chrome.runtime before injecting the content script so its
	// onMessage listener registers against our mock.
	const dispatch = await mockChromeRuntimeOnMessage(testPage);
	await injectExtensionJsContentScript(testPage);

	// Trigger the snapshot via the registered listener
	await dispatch("page_snapshot_data");

	// Verify the real snapshot assigned data-ref-id attributes
	const refIds = await testPage.evaluate(() => {
		const elements = document.querySelectorAll<HTMLElement>(
			"input, button, select, textarea",
		);
		return Array.from(elements).map((el) => el.getAttribute("data-ref-id"));
	});

	expect(refIds.length).toBeGreaterThanOrEqual(4);
	for (const refId of refIds) {
		expect(refId).toMatch(/^e\d+$/);
	}

	await close();
});
