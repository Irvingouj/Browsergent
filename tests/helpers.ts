import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	type BrowserContext,
	chromium,
	expect,
	type Page,
	test,
} from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, "../dist");

const consoleErrors: string[] = [];

export async function launchExtension(userDataDir?: string): Promise<{
	context: BrowserContext;
	extensionId: string;
	sidePanel: Page;
	close: () => Promise<void>;
}> {
	const context = await chromium.launchPersistentContext(userDataDir ?? "", {
		channel: "chromium",
		headless: true,
		args: [
			`--disable-extensions-except=${extensionPath}`,
			`--load-extension=${extensionPath}`,
		],
	});

	let serviceWorker = context.serviceWorkers()[0];
	if (!serviceWorker) {
		serviceWorker = await context.waitForEvent("serviceworker");
	}
	const extensionId = serviceWorker.url().split("/")[2];

	const sidePanel = await context.newPage();
	sidePanel.on("console", (msg) => {
		if (msg.type() === "error") {
			consoleErrors.push(msg.text());
		}
	});
	await sidePanel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
	await sidePanel.waitForSelector('[data-initialized="true"]', {
		timeout: 10000,
	});
	await sidePanel.waitForSelector('[data-worker-ready="true"]', {
		timeout: 10000,
	});

	return {
		context,
		extensionId,
		sidePanel,
		close: async () => await context.close(),
	};
}

test.afterEach(({ page: _page }, testInfo) => {
	if (testInfo.status !== "passed" && consoleErrors.length > 0) {
		console.log(
			`\n--- Console errors for "${testInfo.title}" ---\n${consoleErrors.join("\n")}\n`,
		);
	}
	consoleErrors.length = 0;
});

export async function createTestPage(
	context: BrowserContext,
	html: string,
): Promise<Page> {
	const page = await context.newPage();
	await page.setContent(html);
	return page;
}

/** Inject extension-js content script into a page (manual injection path). */
export async function injectContentScript(page: Page): Promise<void> {
	const scriptContent = await fs.readFile(
		path.resolve(__dirname, "../dist/content-script.js"),
		"utf8",
	);
	const plain = scriptContent.replace(/\nexport\s+\{\};\s*$/, "");
	await page.addScriptTag({ content: `(function(){${plain}})()` });
}

/** Keep the target web page as Chrome's active tab before extension-js page.* calls. */
export async function focusTargetTab(page: Page): Promise<void> {
	await page.bringToFront();
	await page.click("body");
}

/** Configure mock Anthropic provider and close overlays that block the run button. */
export async function configureMockProvider(
	sidePanel: Page,
	mockUrl: string,
	apiKey = "test-key",
): Promise<void> {
	await sidePanel.getByRole("button", { name: "More options" }).click();
	await sidePanel.getByRole("button", { name: "Open settings" }).click();
	await sidePanel.locator('input[type="password"]').fill(apiKey);
	await sidePanel.locator('input[type="text"]').nth(0).fill(mockUrl);
	await sidePanel.getByRole("button", { name: "Save settings" }).click();
	await sidePanel.locator('[data-testid="close-session-panel"]').click();
	await expect(sidePanel.getByTestId("new-session-button")).not.toBeVisible();
}

import { createServer } from "node:http";

export interface MockAnthropicServer {
	url: string;
	server: ReturnType<typeof createServer>;
	requestBodies: unknown[];
}

export function startMockAnthropicServer(options: {
	responses: Array<{
		chunks: string[];
		delays: number[];
		stopReason: "end_turn" | "tool_use";
	}>;
}): MockAnthropicServer {
	const requestBodies: unknown[] = [];
	const server = createServer((req, res) => {
		if (req.method === "OPTIONS") {
			res.writeHead(204, {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Headers":
					"content-type, x-api-key, anthropic-version, authorization",
				"Access-Control-Allow-Methods": "POST",
			});
			res.end();
			return;
		}
		if (req.url === "/v1/messages" && req.method === "POST") {
			let body = "";
			req.on("data", (chunk) => {
				body += chunk;
			});
			req.on("end", () => {
				try {
					requestBodies.push(JSON.parse(body));
				} catch {
					requestBodies.push(body);
				}
				const response = options.responses[requestBodies.length - 1] ?? {
					chunks: [],
					delays: [],
					stopReason: "end_turn",
				};
				res.writeHead(200, {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					"Access-Control-Allow-Origin": "*",
				});
				let chunkIndex = 0;
				function sendNext() {
					if (chunkIndex >= response.chunks.length) {
						res.write(
							`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: response.stopReason, stop_sequence: null }, usage: { output_tokens: 0 } })}\n\n`,
						);
						res.write(
							`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
						);
						res.end();
						return;
					}
					const chunk = response.chunks[chunkIndex];
					const delay = response.delays[chunkIndex] ?? 0;
					setTimeout(() => {
						res.write(chunk);
						chunkIndex++;
						sendNext();
					}, delay);
				}
				sendNext();
			});
		} else {
			res.writeHead(404);
			res.end();
		}
	});
	server.listen(0);
	const address = server.address();
	const port =
		typeof address === "object" && address !== null ? address.port : 0;
	return { url: `http://localhost:${port}`, server, requestBodies };
}
