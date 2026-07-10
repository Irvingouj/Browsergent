import fs from "node:fs/promises";
import os from "node:os";
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

/** Sleep without Playwright page APIs (page.waitForTimeout can hang on extension pages). */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Click via DOM HTMLElement.click(). Playwright's Locator.click hangs on
 * chrome-extension:// pages (post-click "scheduled navigations" / actionability).
 */
export async function domClickTestId(
	page: Page,
	testId: string,
	timeoutMs = 15_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const clicked = await page.evaluate((id) => {
			const el = document.querySelector(
				`[data-testid="${id}"]`,
			) as HTMLElement | null;
			if (!el) return false;
			el.click();
			return true;
		}, testId);
		if (clicked) return;
		await sleep(50);
	}
	throw new Error(`domClickTestId: [${testId}] not found within ${timeoutMs}ms`);
}

/** Click a button by exact trimmed textContent. */
export async function domClickButton(
	page: Page,
	name: string,
	timeoutMs = 15_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const clicked = await page.evaluate((n) => {
			const el = [...document.querySelectorAll("button")].find(
				(b) => b.textContent?.trim() === n,
			) as HTMLElement | undefined;
			if (!el) return false;
			el.click();
			return true;
		}, name);
		if (clicked) return;
		await sleep(50);
	}
	throw new Error(`domClickButton: "${name}" not found within ${timeoutMs}ms`);
}

/** Click first element matching a CSS selector (via DOM). */
export async function domClickSelector(
	page: Page,
	selector: string,
	timeoutMs = 15_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const clicked = await page.evaluate((sel) => {
			const el = document.querySelector(sel) as HTMLElement | null;
			if (!el) return false;
			el.click();
			return true;
		}, selector);
		if (clicked) return;
		await sleep(50);
	}
	throw new Error(
		`domClickSelector: ${selector} not found within ${timeoutMs}ms`,
	);
}

/** Fill an input/textarea by test id without Playwright actionability waits. */
export async function domFillTestId(
	page: Page,
	testId: string,
	value: string,
	timeoutMs = 15_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const ok = await page.evaluate(
			({ id, v }) => {
				const el = document.querySelector(`[data-testid="${id}"]`) as
					| HTMLInputElement
					| HTMLTextAreaElement
					| null;
				if (!el) return false;
				el.focus();
				// Native value setter so Preact onInput sees the new value.
				const proto =
					el.tagName === "TEXTAREA"
						? HTMLTextAreaElement.prototype
						: HTMLInputElement.prototype;
				const desc = Object.getOwnPropertyDescriptor(proto, "value");
				desc?.set?.call(el, v);
				el.dispatchEvent(new Event("input", { bubbles: true }));
				el.dispatchEvent(new Event("change", { bubbles: true }));
				return true;
			},
			{ id: testId, v: value },
		);
		if (ok) return;
		await sleep(50);
	}
	throw new Error(`domFillTestId: [${testId}] not found within ${timeoutMs}ms`);
}

export async function launchExtension(userDataDir?: string): Promise<{
	context: BrowserContext;
	extensionId: string;
	sidePanel: Page;
	close: () => Promise<void>;
}> {
	const actualUserDataDir =
		userDataDir ??
		(await fs.mkdtemp(path.join(os.tmpdir(), "browsergent-e2e-")));
	const shouldRemoveUserDataDir = userDataDir === undefined;
	const context = await chromium.launchPersistentContext(actualUserDataDir, {
		channel: "chromium",
		headless: true,
		args: [
			`--disable-extensions-except=${extensionPath}`,
			`--load-extension=${extensionPath}`,
			// Multi-window extension E2E: unfocused windows throttle timers + CDP.
			// Without these, second sidepanel boot and page.evaluate freeze for minutes.
			"--disable-background-timer-throttling",
			"--disable-backgrounding-occluded-windows",
			"--disable-renderer-backgrounding",
			"--disable-features=CalculateNativeWinOcclusion",
			"--disable-ipc-flooding-protection",
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
	// Shell-ready: initialized + boot worker flag. Agent-worker is lazy (created on first Run),
	// so data-worker-ready may mean "shell ready" rather than WASM agent online.
	// Note: waitForFunction(fn, arg, options) — pass null arg so timeout is not eaten as arg.
	await sidePanel.waitForFunction(
		() => {
			const el = document.querySelector("[data-initialized]");
			if (!el) return false;
			const initialized = el.getAttribute("data-initialized") === "true";
			const workerReady =
				el.getAttribute("data-worker-ready") === "true" ||
				el.getAttribute("data-boot-worker") === "ok";
			return initialized && workerReady;
		},
		null,
		{ timeout: 30_000 },
	);

	return {
		context,
		extensionId,
		sidePanel,
		close: async () => {
			await context.close();
			if (shouldRemoveUserDataDir) {
				await fs.rm(actualUserDataDir, { recursive: true, force: true });
			}
		},
	};
}

/** Bring an extension page forward so Chromium unthrottles timers / CDP. */
export async function focusExtensionPage(page: Page): Promise<void> {
	await page.bringToFront().catch(() => {
		/* ignore */
	});
	// Tiny yield so focus settles before evaluate (avoids CDP stall).
	await sleep(30);
}

/**
 * page.evaluate after bringToFront.
 *
 * IMPORTANT: do NOT Promise.race evaluate with setTimeout — abandoned
 * evaluates keep CDP sessions busy and make subsequent evaluates hang
 * forever on chrome-extension:// multi-window.
 */
export async function evalOnPanel<T>(
	page: Page,
	fn: () => T | Promise<T>,
): Promise<T> {
	await focusExtensionPage(page);
	return page.evaluate(fn);
}

/** Open a sidepanel document in a second Chrome window (distinct windowId). */
export async function openSecondWindow(
	context: BrowserContext,
	extensionId: string,
	_anchor?: Page,
	options?: { onPage?: (page: Page) => void },
): Promise<{ sidePanel: Page; windowId: number }> {
	let serviceWorker = context.serviceWorkers()[0];
	if (!serviceWorker) {
		serviceWorker = await context.waitForEvent("serviceworker");
	}

	const before = new Set(context.pages());
	// Create window first to learn its id, then open sidepanel with ?windowId=
	// so resolveOrCreateForWindow binds correctly without hung getCurrent.
	const createdWindowId = await serviceWorker.evaluate(async (extId: string) => {
		const w = await chrome.windows.create({
			url: "about:blank",
			focused: true,
			type: "normal",
			width: 900,
			height: 700,
		});
		if (typeof w.id !== "number") {
			throw new Error("windows.create returned no id");
		}
		const tabs = await chrome.tabs.query({ windowId: w.id });
		const tabId = tabs[0]?.id;
		if (tabId === undefined) {
			throw new Error("no tab in created window");
		}
		await chrome.tabs.update(tabId, {
			url: `chrome-extension://${extId}/sidepanel.html?windowId=${w.id}`,
		});
		// Keep the new window focused so boot is not timer-throttled.
		await chrome.windows.update(w.id, { focused: true });
		return w.id;
	}, extensionId);

	const sidepanelUrl = `chrome-extension://${extensionId}/sidepanel.html?windowId=${createdWindowId}`;
	const findDeadline = Date.now() + 20_000;
	let newPage: Page | undefined;
	while (Date.now() < findDeadline) {
		newPage = context
			.pages()
			.find(
				(p) =>
					!before.has(p) &&
					(p.url().includes("/sidepanel.html") || p.url() === "about:blank"),
			);
		if (newPage?.url().includes("/sidepanel.html")) break;
		if (newPage && newPage.url() === "about:blank") {
			// SW may already be navigating this tab to sidepanel — wait before goto.
			await sleep(200);
			if (!newPage.url().includes("/sidepanel.html")) {
				await newPage
					.goto(sidepanelUrl, { waitUntil: "domcontentloaded" })
					.catch(() => {
						/* navigation race — URL may already be sidepanel */
					});
			}
			break;
		}
		await sleep(100);
	}
	if (!newPage) {
		// Last resort: open a page ourselves in the created window is hard; use newPage.
		newPage = await context.newPage();
		await newPage.goto(sidepanelUrl, { waitUntil: "domcontentloaded" });
	} else if (!newPage.url().includes("/sidepanel.html")) {
		await newPage
			.goto(sidepanelUrl, { waitUntil: "domcontentloaded" })
			.catch(() => {
				/* navigation race */
			});
	}

	newPage.on("console", (msg) => {
		if (msg.type() === "error") {
			consoleErrors.push(msg.text());
		}
	});
	// Let callers attach listeners before boot emits (e.g. [idb-timing] harvest).
	options?.onPage?.(newPage);
	await focusExtensionPage(newPage);

	// Prefer SW-visible panelReady marker — page.evaluate on a second
	// chrome-extension:// document often freezes under multi-window CDP load.
	const readyDeadline = Date.now() + 60_000;
	let readyVia: "storage" | "dom" | null = null;
	let finalState: Record<string, unknown> | null = null;
	while (Date.now() < readyDeadline) {
		try {
			const marker = await serviceWorker.evaluate(async (wid: number) => {
				const key = `panelReady:${wid}`;
				const got = await chrome.storage.session.get(key);
				return (got[key] as { ts?: number; step?: string; idb?: string } | undefined) ?? null;
			}, createdWindowId);
			if (marker && typeof marker.ts === "number") {
				readyVia = "storage";
				finalState = { via: "storage", ...marker, windowId: createdWindowId };
				break;
			}
		} catch {
			/* SW evaluate may briefly fail during restart */
		}
		// Fallback: DOM poll (works when CDP is healthy).
		try {
			await focusExtensionPage(newPage);
			const snap = await newPage.evaluate(() => {
				const el = document.querySelector("[data-initialized]");
				return {
					initialized: el?.getAttribute("data-initialized") ?? null,
					workerReady: el?.getAttribute("data-worker-ready") ?? null,
					bootWorker: el?.getAttribute("data-boot-worker") ?? null,
					windowId: el?.getAttribute("data-window-id") ?? null,
					bootStep: document.documentElement.dataset.bootStep ?? null,
				};
			});
			finalState = snap;
			if (
				snap.initialized === "true" &&
				(snap.workerReady === "true" || snap.bootWorker === "ok")
			) {
				readyVia = "dom";
				break;
			}
		} catch {
			/* CDP stall — keep waiting on storage marker */
		}
		await sleep(250);
	}
	if (!readyVia) {
		throw new Error(
			`openSecondWindow: shell not ready after 60s: ${JSON.stringify(finalState)}`,
		);
	}
	console.log(
		"openSecondWindow ready via",
		readyVia,
		"windowB",
		createdWindowId,
		finalState,
	);
	const windowId =
		typeof createdWindowId === "number" && createdWindowId > 0
			? createdWindowId
			: Number(finalState?.windowId);
	if (!Number.isFinite(windowId) || windowId <= 0) {
		throw new Error(`Second window has invalid data-window-id: ${windowId}`);
	}
	return { sidePanel: newPage, windowId };
}

/** Close a Chrome window by id (simulates merge destroying the removed window). */
export async function closeChromeWindow(
	context: BrowserContext,
	windowId: number,
): Promise<void> {
	let serviceWorker = context.serviceWorkers()[0];
	if (!serviceWorker) {
		serviceWorker = await context.waitForEvent("serviceworker");
	}
	await serviceWorker.evaluate(async (wid: number) => {
		await chrome.windows.remove(wid);
	}, windowId);
}

/** Merge windows by moving a tab — exercises the real coordinator path. */
export async function mergeWindowsByMovingTab(
	removedPanel: Page,
	removedWindowId: number,
	survivorWindowId: number,
): Promise<void> {
	await removedPanel.evaluate(
		async ({
			removed,
			survivor,
		}: {
			removed: number;
			survivor: number;
		}) => {
			const tabs = await chrome.tabs.query({ windowId: removed });
			const tabId = tabs[0]?.id;
			if (tabId === undefined) {
				throw new Error(`no tab in window ${removed}`);
			}
			await chrome.tabs.move(tabId, { windowId: survivor, index: -1 });
			try {
				await chrome.windows.get(removed);
				await chrome.windows.remove(removed);
			} catch {
				// Chrome may auto-close the window once its last tab moves out.
			}
			await new Promise((resolve) => setTimeout(resolve, 200));
		},
		{ removed: removedWindowId, survivor: survivorWindowId },
	);
}

/** Poll IDB runningSessionsByWindow (panel can stay closed). */
export async function pollPersistedRunningSessions(
	panel: Page,
	minCount: number,
	timeoutMs = 10_000,
): Promise<void> {
	await expect
		.poll(
			async () =>
				panel.evaluate(async () => {
					const db = await new Promise<IDBDatabase>((resolve, reject) => {
						const req = indexedDB.open("browsergent", 2);
						req.onsuccess = () => resolve(req.result);
						req.onerror = () => reject(req.error);
					});
					const meta = await new Promise<{
						runningSessionsByWindow?: Record<string, string[]>;
					} | null>((resolve, reject) => {
						const tx = db.transaction("sessions", "readonly");
						const req = tx.objectStore("sessions").get("__meta");
						req.onsuccess = () =>
							resolve(
								req.result as {
									runningSessionsByWindow?: Record<string, string[]>;
								} | null,
							);
						req.onerror = () => reject(req.error);
					});
					db.close();
					const byWindow = meta?.runningSessionsByWindow ?? {};
					return Object.values(byWindow).flat().length;
				}),
			{ timeout: timeoutMs },
		)
		.toBeGreaterThanOrEqual(minCount);
}

/** Broadcast a window close lifecycle event from the service worker. */
export async function broadcastWindowClose(
	context: BrowserContext,
	panel: Page,
	removedWindowId: number,
): Promise<void> {
	let serviceWorker = context.serviceWorkers()[0];
	if (!serviceWorker) {
		serviceWorker = await context.waitForEvent("serviceworker");
	}
	await serviceWorker.evaluate(async (removed: number) => {
		const message = {
			type: "windowLifecycle",
			kind: "close",
			removedWindowId: removed,
		};
		chrome.runtime.sendMessage(message);
		await chrome.storage.session.set({
			windowLifecycleEvent: { ...message, emittedAt: Date.now() },
		});
	}, removedWindowId);
	await panel.waitForTimeout(500);
}

/** Broadcast a window merge lifecycle event from the service worker. */
export async function broadcastWindowMerge(
	context: BrowserContext,
	survivorPanel: Page,
	removedWindowId: number,
	survivorWindowId: number,
	options?: { reboundRunningSessionIds?: string[] },
): Promise<void> {
	let serviceWorker = context.serviceWorkers()[0];
	if (!serviceWorker) {
		serviceWorker = await context.waitForEvent("serviceworker");
	}
	await serviceWorker.evaluate(
		async ({
			removed,
			survivor,
			reboundRunningSessionIds,
		}: {
			removed: number;
			survivor: number;
			reboundRunningSessionIds?: string[];
		}) => {
			const message = {
				type: "windowLifecycle",
				kind: "merge",
				removedWindowId: removed,
				survivorWindowId: survivor,
				reboundRunningSessionIds:
					reboundRunningSessionIds && reboundRunningSessionIds.length > 0
						? reboundRunningSessionIds
						: undefined,
			};
			chrome.runtime.sendMessage(message);
			await chrome.storage.session.set({
				windowLifecycleEvent: { ...message, emittedAt: Date.now() },
			});
		},
		{
			removed: removedWindowId,
			survivor: survivorWindowId,
			reboundRunningSessionIds: options?.reboundRunningSessionIds,
		},
	);
	await survivorPanel.waitForTimeout(500);
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

/** Upload a binary file through the Files panel input, building it from base64 browser-side. */
export async function uploadBinaryViaPanel(
	sidePanel: Page,
	fileName: string,
	base64: string,
	mimeType = "application/octet-stream",
): Promise<void> {
	await sidePanel.evaluate(
		({ fileName, base64, mimeType }) => {
			const binary = atob(base64);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
			const dataTransfer = new DataTransfer();
			const file = new File([bytes], fileName, { type: mimeType });
			dataTransfer.items.add(file);
			const input = document.querySelector(
				'[data-testid="file-upload"]',
			) as HTMLInputElement | null;
			if (input) {
				input.files = dataTransfer.files;
				input.dispatchEvent(new Event("change", { bubbles: true }));
			}
		},
		{ fileName, base64, mimeType },
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
/** Poll until a test id exists (DOM only — no Locator actionability). */
async function waitForTestId(
	page: Page,
	testId: string,
	timeoutMs = 15_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		// Plain evaluate (no bringToFront spam) — matches working settings-persistence.
		const found = await page
			.evaluate(
				(id) => !!document.querySelector(`[data-testid="${id}"]`),
				testId,
			)
			.catch(() => false);
		if (found) return;
		await sleep(50);
	}
	// Last-ditch snapshot for diagnostics.
	const snap = await page
		.evaluate(() => ({
			text: document.body?.innerText?.slice(0, 200) ?? "",
			ids: [...document.querySelectorAll("[data-testid]")].map((e) =>
				e.getAttribute("data-testid"),
			),
		}))
		.catch((e) => ({ error: String(e) }));
	throw new Error(
		`waitForTestId: [${testId}] not found within ${timeoutMs}ms snap=${JSON.stringify(snap)}`,
	);
}

export async function configureMockProvider(
	sidePanel: Page,
	mockUrl: string,
	apiKey = "test-key",
	model?: string,
): Promise<void> {
	await focusExtensionPage(sidePanel);
	// Settings is a top-level tab (not buried under More options anymore).
	await domClickButton(sidePanel, "Settings");
	await waitForTestId(sidePanel, "settings-list");

	const hasEdit = await evalOnPanel(
		sidePanel,
		() => !!document.querySelector('[data-testid^="settings-edit-"]'),
	);
	if (hasEdit) {
		await domClickSelector(sidePanel, '[data-testid^="settings-edit-"]');
	} else {
		await domClickTestId(sidePanel, "settings-add-provider");
		await domClickTestId(
			sidePanel,
			model === undefined
				? "settings-add-anthropic"
				: "settings-add-anthropic-compatible",
		);
	}

	await waitForTestId(sidePanel, "settings-edit");
	await domFillTestId(
		sidePanel,
		"settings-baseurl-input",
		`${mockUrl}/v1/messages`,
	);
	await domFillTestId(sidePanel, "settings-apikey-input", apiKey);
	if (model !== undefined) {
		await domFillTestId(sidePanel, "settings-model-input", model);
		await domClickTestId(sidePanel, "settings-add-model-button");
		// selectOption can hang on extension pages; set value via DOM.
		await focusExtensionPage(sidePanel);
		await sidePanel.evaluate((m) => {
			const sel = document.querySelector(
				'[data-testid="settings-default-model-select"]',
			) as HTMLSelectElement | null;
			if (!sel) return;
			const opt = [...sel.options].find((o) => o.label === m || o.value === m);
			if (opt) {
				sel.value = opt.value;
				sel.dispatchEvent(new Event("change", { bubbles: true }));
			}
		}, model);
	}
	await domClickTestId(sidePanel, "settings-done-button");
	await domClickButton(sidePanel, "Chat");
	await waitForTestId(sidePanel, "task-input");
}

export async function typeTask(sidePanel: Page, text: string): Promise<void> {
	// Prefer DOM focus + insertText; Locator.click hangs on chrome-extension pages.
	await focusExtensionPage(sidePanel);
	await evalOnPanel(sidePanel, () => {
		const el = document.querySelector(
			'[data-testid="task-input"]',
		) as HTMLElement | null;
		el?.focus();
	});
	await sidePanel.keyboard.insertText(text);
}

/** Click the icon-only Run control (aria-label / data-testid="run-button"). */
export async function clickRun(sidePanel: Page): Promise<void> {
	await focusExtensionPage(sidePanel);
	await domClickTestId(sidePanel, "run-button");
}

/**
 * Agent status bar shows `error — reason` (and CSS uppercase). Never use
 * getByText('error', { exact: true }) — it will not match.
 */
export async function expectAgentStatus(
	sidePanel: Page,
	pattern: string | RegExp,
	timeoutMs = 15_000,
): Promise<void> {
	await expect(sidePanel.getByTestId("agent-status")).toContainText(pattern, {
		timeout: timeoutMs,
	});
}

/** Read data-window-id without Playwright locator actionability (extension-safe). */
export async function readPanelWindowId(sidePanel: Page): Promise<number> {
	const raw = await evalOnPanel(
		sidePanel,
		() =>
			document
				.querySelector("[data-initialized]")
				?.getAttribute("data-window-id") ?? "",
	);
	return Number(raw);
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
			const blockTags = new Set(["DIV", "P", "LI", "H1", "H2", "H3", "PRE"]);
			let out = "";
			const walk = (parent: Node): void => {
				parent.childNodes.forEach((child) => {
					if (child.nodeType === Node.TEXT_NODE) {
						out += child.textContent ?? "";
					} else if (child.nodeType === Node.ELEMENT_NODE) {
						const span = child as HTMLElement;
						const raw = span.getAttribute("data-raw");
						if (raw) out += raw;
						else {
							if (blockTags.has(span.tagName) && out && !out.endsWith("\n")) {
								out += "\n";
							}
							if (span.tagName === "BR") out += "\n";
							else walk(child);
						}
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

/** Mock chrome.runtime.onMessage on a page before content-script injection.
 * Returns a function to dispatch messages to registered listeners. */
export async function mockChromeRuntimeOnMessage(
	page: Page,
): Promise<(action: string) => Promise<unknown>> {
	await page.evaluate(() => {
		const listeners: Array<
			(
				msg: unknown,
				sender: unknown,
				sendResponse: (r: unknown) => void,
			) => void
		> = [];
		(window as unknown as Record<string, unknown>).chrome = {
			runtime: {
				id: "test-extension-id",
				onMessage: {
					addListener: (
						fn: (
							msg: unknown,
							sender: unknown,
							sendResponse: (r: unknown) => void,
						) => void,
					) => listeners.push(fn),
					removeListener: (
						fn: (
							msg: unknown,
							sender: unknown,
							sendResponse: (r: unknown) => void,
						) => void,
					) => {
						const i = listeners.indexOf(fn);
						if (i >= 0) listeners.splice(i, 1);
					},
				},
			},
		};
		(window as unknown as Record<string, unknown>).__testListeners = listeners;
	});
	return (action: string) =>
		page.evaluate((act) => {
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
					(listener) =>
						new Promise<unknown>((resolve) => {
							listener(
								{ type: "registryCall", action: act, params: {}, id: "test-1" },
								{ id: "test-extension-id" },
								(response: unknown) => resolve(response),
							);
						}),
				),
			).then((results) => results[0]);
		}, action);
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
		stopReason: "end_turn" | "error" | "tool_use";
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
