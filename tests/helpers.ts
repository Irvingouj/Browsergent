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

/** Upload a file through the Files panel hidden input (Files tab must be open). */
export async function uploadFileViaPanel(
	sidePanel: Page,
	fileName: string,
	content: string,
	mimeType = "application/octet-stream",
): Promise<void> {
	await sidePanel.evaluate(
		({ fileName, content, mimeType }) => {
			const dataTransfer = new DataTransfer();
			const file = new File([content], fileName, { type: mimeType });
			dataTransfer.items.add(file);
			const input = document.querySelector(
				'[data-testid="file-upload"]',
			) as HTMLInputElement | null;
			if (input) {
				input.files = dataTransfer.files;
				input.dispatchEvent(new Event("change", { bubbles: true }));
			}
		},
		{ fileName, content, mimeType },
	);
}

const MOCK_END_TURN_CHUNKS = [
	`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg-1", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
	`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
	`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Done." } })}\n\n`,
	`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
];

export function startSimpleMockProvider(): MockAnthropicServer {
	return startMockAnthropicServer({
		responses: [
			{
				chunks: MOCK_END_TURN_CHUNKS,
				delays: [0, 0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});
}

export function extractFirstUserMessageText(body: unknown): string {
	if (typeof body !== "object" || body === null) {
		throw new Error("Expected object request body");
	}
	const messages = (body as Record<string, unknown>).messages;
	if (!Array.isArray(messages)) {
		throw new Error("Expected messages array");
	}
	const userMessage = messages.find(
		(m): m is Record<string, unknown> =>
			typeof m === "object" && m !== null && m.role === "user",
	);
	if (!userMessage) {
		throw new Error("Expected user message");
	}
	const content = userMessage.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((c: unknown) => {
				if (typeof c === "object" && c !== null && "text" in c) {
					return String((c as Record<string, unknown>).text ?? "");
				}
				return "";
			})
			.join("");
	}
	throw new Error(`Unexpected content type: ${typeof content}`);
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

/**
 * Read the canonical value of the contenteditable task-input. Chip spans
 * contribute their `data-raw` token (@[file:…], @[tab:…], /skill:…); text
 * nodes contribute their text. Replaces `inputValue()`, which only worked
 * when task-input was a <textarea>.
 *
 * The contentEditable DOM is updated by an async (useEffect) reconciliation
 * one render after setTaskDraft, so we poll until the DOM settles (two
 * consecutive identical reads) before returning — picker-insert tests read
 * immediately after a click that dispatched setTaskDraft.
 */
export async function readTaskInput(sidePanel: Page): Promise<string> {
	const readOnce = async (): Promise<string> => {
		return sidePanel.evaluate(() => {
			const el = document.querySelector('[data-testid="task-input"]');
			if (!el) return "";
			let out = "";
			const walk = (parent: Node): void => {
				parent.childNodes.forEach((child) => {
					if (child.nodeType === Node.TEXT_NODE) {
						out += child.textContent ?? "";
					} else if (child.nodeType === Node.ELEMENT_NODE) {
						const span = child as HTMLElement;
						const raw = span.getAttribute("data-raw");
						if (raw) out += raw;
						else walk(child);
					}
				});
			};
			walk(el);
			return out;
		});
	};
	let prev = await readOnce();
	for (let i = 0; i < 20; i++) {
		await sidePanel.waitForTimeout(50);
		const next = await readOnce();
		if (next === prev) return next;
		prev = next;
	}
	return prev;
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
