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

async function dispatchRegistryCall(
	page: import("@playwright/test").Page,
	action: string,
	params: Record<string, unknown> = {},
): Promise<unknown> {
	return page.evaluate(
		({ action: act, params: callParams }) => {
			const listeners = (window as unknown as Record<string, unknown>)
				.__testListeners as Array<
				(
					msg: unknown,
					sender: unknown,
					sendResponse: (r: unknown) => void,
				) => void
			>;
			return Promise.all(
				listeners.map(
					(listener, index) =>
						new Promise<unknown>((resolve) => {
							listener(
								{
									type: "registryCall",
									action: act,
									params: callParams,
									id: `test-${index}`,
								},
								{ id: "test-extension-id" },
								(response: unknown) => resolve(response),
							);
						}),
				),
			).then((results) => results[0]);
		},
		{ action, params },
	);
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

test("extension-js content script observes and activates Gmail-style jsaction controls", async () => {
	const { context, close } = await launchExtension();
	const testPage = await createTestPage(
		context,
		`
		<!DOCTYPE html>
		<html>
		<body>
			<div id="archive" jsaction="click:mail.archive" aria-label="Archive"></div>
			<div id="status">idle</div>
			<script>
				const archive = document.getElementById('archive');
				archive.addEventListener('mousedown', () => {
					document.getElementById('status').textContent = 'mousedown';
				});
			</script>
		</body>
		</html>
		`,
	);
	await mockChromeRuntimeOnMessage(testPage);
	await injectExtensionJsContentScript(testPage);

	const snapshot = (await dispatchRegistryCall(
		testPage,
		"page_snapshot_data",
	)) as {
		ok: boolean;
		value?: { nodes?: Array<{ name?: string; refId?: string }> };
	};
	expect(snapshot.ok).toBe(true);
	const archive = snapshot.value?.nodes?.find(
		(node) => node.name === "Archive",
	);
	expect(archive?.refId).toMatch(/^e\d+$/);

	const click = (await dispatchRegistryCall(testPage, "page_click", {
		refId: archive?.refId,
	})) as { ok: boolean };
	expect(click.ok).toBe(true);
	await expect(testPage.locator("#status")).toHaveText("mousedown");

	await close();
});

test("extension-js content script does not mark covered clickables as actionable", async () => {
	const { context, close } = await launchExtension();
	const testPage = await createTestPage(
		context,
		`
		<!DOCTYPE html>
		<html>
		<body>
			<div
				id="covered"
				jsaction="click:mail.archive"
				aria-label="Archive"
				style="position:absolute; left:20px; top:20px; width:120px; height:40px; z-index:1"
			></div>
			<div
				id="top"
				role="button"
				aria-label="Overlay"
				style="position:absolute; left:20px; top:20px; width:120px; height:40px; z-index:2"
			></div>
		</body>
		</html>
		`,
	);
	await mockChromeRuntimeOnMessage(testPage);
	await injectExtensionJsContentScript(testPage);

	const snapshot = (await dispatchRegistryCall(
		testPage,
		"page_snapshot_data",
	)) as {
		ok: boolean;
		value?: {
			nodes?: Array<{
				name?: string;
				actionable?: boolean;
				recommendedAction?: string;
			}>;
		};
	};
	expect(snapshot.ok).toBe(true);
	const archive = snapshot.value?.nodes?.find(
		(node) => node.name === "Archive",
	);
	const overlay = snapshot.value?.nodes?.find(
		(node) => node.name === "Overlay",
	);

	expect(archive).toBeDefined();
	expect(archive?.actionable).not.toBe(true);
	expect(overlay).toMatchObject({
		actionable: true,
		recommendedAction: "click",
	});

	await close();
});
