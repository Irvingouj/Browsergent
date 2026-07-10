/**
 * Steer E2E — mocked LLM via cassette replay.
 *
 * Verifies the user can type a follow-up WHILE a task is running and have it
 * delivered as a steer (queued, non-interrupting) rather than aborting the run.
 *
 * The LLM is a replay server (scripts/replay-llm.mjs) serving a recorded
 * DeepSeek cassette. No API key required. The replay runs in --loose mode
 * because the steer text cannot have been in the recording — the assertion
 * that the steer reached the model is done by intercepting requests in
 * Playwright, not by the replay matcher.
 *
 * Prereq: `npm run build` (dist/ must exist).
 */
import { spawn } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import {
	clickRun,
	configureMockProvider,
	focusTargetTab,
	launchExtension,
} from "./helpers";

const CASSETTE = "tests/fixtures/llm-cassettes/steer-basic";
const REPLAY_PORT = 8787;
const REPLAY_URL = `http://localhost:${REPLAY_PORT}`;

let replayProc: ReturnType<typeof spawn> | null = null;

test.beforeAll(async () => {
	replayProc = spawn("node", ["scripts/replay-llm.mjs", CASSETTE, "--loose"], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error("replay server did not start")),
			5000,
		);
		const onLine = (chunk: Buffer): void => {
			const text = chunk.toString();
			if (text.includes("serving cassette")) {
				clearTimeout(timeout);
				resolve();
			}
			if (text.includes("No turns found") || text.includes("Error")) {
				clearTimeout(timeout);
				reject(new Error(text.trim()));
			}
		};
		replayProc?.stdout?.on("data", onLine);
		replayProc?.stderr?.on("data", onLine);
	});
});

test.afterAll(() => {
	replayProc?.kill("SIGTERM");
	replayProc = null;
});

/** Capture all /v1/messages request bodies so we can assert the steer arrived. */
async function captureRequestBodies(sidePanel: Page): Promise<string[]> {
	const bodies: string[] = [];
	await sidePanel.route("**/v1/messages**", async (route) => {
		const postData = route.request().postData();
		if (postData) bodies.push(postData);
		await route.continue();
	});
	return bodies;
}

test.describe("steer mid-run (mocked LLM)", () => {
	test("user can type and steer during a running task", async () => {
		test.setTimeout(60_000);
		const { sidePanel, context, close } = await launchExtension();

		try {
			// Target tab — the site under test.
			const target = await context.newPage();
			await target.goto("https://example.com", {
				waitUntil: "domcontentloaded",
			});
			await focusTargetTab(target);

			// Point the extension at the replay server.
			await configureMockProvider(
				sidePanel,
				REPLAY_URL,
				"test-key",
				"deepseek-v4-flash",
			);

			const requestBodies = await captureRequestBodies(sidePanel);

			// Start the task. The cassette's turn 1 responds with a run_js tool
			// call — the agent enters executing_tool state.
			const input = sidePanel.locator('[data-testid="task-input"]');
			await input.click();
			await sidePanel.keyboard.insertText(
				"Take a snapshot of this page and describe it.",
			);
			await clickRun(sidePanel);

			// The run started — stop button replaces run button.
			await expect(
				sidePanel.locator('[data-testid="stop-button"]'),
			).toBeVisible({ timeout: 30_000 });

			// === THE STEER ===
			// While the task is running, the input must stay editable (the bug
			// was that it was disabled during runs).
			await expect(input).toBeEditable();

			const steerText = "actually just give me the page title";
			// ContentEditable: bring panel forward, focus, insertText, Enter.
			await sidePanel.bringToFront();
			await sidePanel.evaluate(() => {
				const el = document.querySelector(
					'[data-testid="task-input"]',
				) as HTMLElement | null;
				el?.focus();
			});
			await sidePanel.keyboard.insertText(steerText);
			// Enter submits. While running this routes to onSteer, not onRun.
			await sidePanel.keyboard.press("Enter");

			// The steered text appears as a user message bubble.
			await expect(
				sidePanel.locator('[data-testid="chat-message-user"]').filter({
					hasText: steerText,
				}),
			).toBeVisible({ timeout: 20_000 });

			// The steered text reached the model — it's in some request body.
			await expect
				.poll(async () => requestBodies.some((b) => b.includes(steerText)), {
					timeout: 20_000,
					message: "steer text reached the model request body",
				})
				.toBe(true);

			// Hard-stop if still running; cassette may finish before we get here.
			const stop = sidePanel.locator('[data-testid="stop-button"]');
			if (await stop.isVisible().catch(() => false)) {
				await stop.click({ timeout: 5_000 }).catch(() => {});
			}
		} finally {
			await close();
		}
	});
});
