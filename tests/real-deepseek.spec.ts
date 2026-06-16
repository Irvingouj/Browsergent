/**
 * Real-provider smoke test against DeepSeek's Anthropic-compatible endpoint.
 *
 * Goal: drive a real LLM round-trip and verify:
 *   - tabId fix lands in the agent's tool output
 *   - thrown error message survives end-to-end through the trace pipeline
 *   - observe anything else that breaks (UI, races, malformed requests, etc.)
 *
 * Reads credentials from ~/rc.deepseek.rc — skipped if DEEPSEEK_API_KEY is missing.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { focusTargetTab, launchExtension } from "./helpers";

function readRc(): Record<string, string> {
	try {
		const out = execSync("cat ~/rc.deepseek.rc", { encoding: "utf8" });
		const vars: Record<string, string> = {};
		for (const line of out.split("\n")) {
			const m = line.match(/^\s*export\s+([A-Z_]+)="(.*)"\s*$/);
			if (m) vars[m[1]] = m[2];
		}
		return vars;
	} catch {
		return {};
	}
}

const RC = readRc();
const DEEPSEEK_API_KEY =
	RC.DEEPSEEK_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? "";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/anthropic";
const DEEPSEEK_MODEL = "deepseek-v4-pro[1m]";

// The agent is told verbatim what to run; we match on the marker string so model
// variability in surrounding scaffolding doesn't break the assertions.
const TASK_PROMPT = [
	"Run exactly this JS via run_js and then stop:",
	"```js",
	"const tabs = await page.tabs({});",
	"const probe = {",
	"  tabCount: tabs.length,",
	"  firstTabId: tabs[0] && tabs[0].tabId,",
	"  firstTabIdType: tabs[0] && typeof tabs[0].tabId,",
	"  firstTabChromeId: tabs[0] && tabs[0].id,",
	"};",
	"throw new Error('DEEPSEEK_PROBE_MARKER:' + JSON.stringify(probe));",
	"```",
	"Throwing the error is intentional — it surfaces the result through the error pipeline. Do not catch it. Do not retry. Do not add anything else.",
].join("\n");

test.describe("real deepseek", () => {
	test.skip(!DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY not set in ~/rc.deepseek.rc");

	test("end-to-end: tabId + error message survive", async ({ page: _page }) => {
		test.setTimeout(180_000);
		const { sidePanel, context, close } = await launchExtension();

		const target = await context.newPage();
		await target.goto("https://example.com", {
			waitUntil: "domcontentloaded",
		});
		await focusTargetTab(target);

		// Configure DeepSeek provider via the settings modal.
		await sidePanel.getByRole("button", { name: "More options" }).click();
		await sidePanel.getByRole("button", { name: "Open settings" }).click();
		await sidePanel.locator('input[type="password"]').fill(DEEPSEEK_API_KEY);
		await sidePanel
			.locator('input[type="text"]')
			.nth(0)
			.fill(DEEPSEEK_BASE_URL);
		await sidePanel.locator('input[type="text"]').nth(1).fill(DEEPSEEK_MODEL);
		await sidePanel.getByRole("button", { name: "Save settings" }).click();
		await sidePanel.locator('[data-testid="close-session-panel"]').click();
		await expect(sidePanel.getByTestId("new-session-button")).not.toBeVisible();

		// Intercept Anthropic requests to capture the full conversation.
		const apiRequests: Array<{
			direction: "request" | "response";
			body: string;
		}> = [];
		// Intercept Anthropic requests to capture the full conversation.
		await sidePanel.route("**/anthropic/v1/messages**", async (route) => {
			const req = route.request();
			const postData = req.postData();
			if (postData) apiRequests.push({ direction: "request", body: postData });
			try {
				const response = await route.fetch();
				const respBody = await response.text();
				apiRequests.push({
					direction: "response",
					body: respBody.slice(0, 5000),
				});
				await route.fulfill({ response });
			} catch {
				// Context closed before response returned — agent follow-up request
				// was in flight during teardown.
				apiRequests.push({ direction: "response", body: "(context closed)" });
			}
		});

		await sidePanel.locator('[data-testid="task-input"]').fill(TASK_PROMPT);
		await sidePanel.getByRole("button", { name: "Run task" }).click();

		const traceEntry = sidePanel.locator("[data-testid='trace-entry']").first();
		await traceEntry.waitFor({ state: "visible", timeout: 60_000 });

		await expect
			.poll(
				async () => {
					const txt = (await traceEntry.textContent()) ?? "";
					return /✓|✗/.test(txt);
				},
				{ timeout: 150_000, intervals: [2_000] },
			)
			.toBe(true);

		await traceEntry.click();
		const traceCard = sidePanel
			.locator("[data-testid='trace-entry']")
			.first()
			.locator("xpath=ancestor::div[contains(@class,'rounded-md')]");
		await expect(sidePanel.getByText("Result", { exact: true })).toBeVisible({
			timeout: 10_000,
		});
		const resultText = (await traceCard.textContent()) ?? "";
		console.log("DEEPSEEK_TRACE_TEXT:", resultText);

		writeFileSync(
			"/tmp/deepseek-tabid-conversation.txt",
			apiRequests.map((e) => `--- ${e.direction} ---\n${e.body}`).join("\n"),
		);
		console.log("Conversation saved to /tmp/deepseek-tabid-conversation.txt");

		// Bug 1: tabId must be present as a number.
		expect(resultText).toContain('"firstTabIdType":"number"');
		expect(resultText).toMatch(/"firstTabId":\d+/);

		// Bug 2: error message must reach the trace intact (not "TypeError: ").
		expect(resultText).toContain("DEEPSEEK_PROBE_MARKER");

		await close();
	});

	// Bug 2 follow-up: when the LLM-generated code triggers a real runtime error
	// (not an intentional throw), the message must still survive. This was the
	// original "page.click({label}) truncation" symptom from the plan.
	test("end-to-end: real ReferenceError surfaces intact", async () => {
		test.setTimeout(180_000);
		const { sidePanel, context, close } = await launchExtension();

		const target = await context.newPage();
		await target.goto("https://example.com", {
			waitUntil: "domcontentloaded",
		});
		await focusTargetTab(target);

		await sidePanel.getByRole("button", { name: "More options" }).click();
		await sidePanel.getByRole("button", { name: "Open settings" }).click();
		await sidePanel.locator('input[type="password"]').fill(DEEPSEEK_API_KEY);
		await sidePanel
			.locator('input[type="text"]')
			.nth(0)
			.fill(DEEPSEEK_BASE_URL);
		await sidePanel.locator('input[type="text"]').nth(1).fill(DEEPSEEK_MODEL);
		await sidePanel.getByRole("button", { name: "Save settings" }).click();
		await sidePanel.locator('[data-testid="close-session-panel"]').click();
		await expect(sidePanel.getByTestId("new-session-button")).not.toBeVisible();

		// Intercept Anthropic requests to capture the full conversation.
		const apiRequests: Array<{
			direction: "request" | "response";
			body: string;
		}> = [];
		await sidePanel.route("**/anthropic/v1/messages**", async (route) => {
			const req = route.request();
			const postData = req.postData();
			if (postData) apiRequests.push({ direction: "request", body: postData });
			try {
				const response = await route.fetch();
				const respBody = await response.text();
				apiRequests.push({
					direction: "response",
					body: respBody.slice(0, 5000),
				});
				await route.fulfill({ response });
			} catch {
				// Context closed before response returned — agent follow-up request
				// was in flight during teardown.
				apiRequests.push({ direction: "response", body: "(context closed)" });
			}
		});

		const refTask = [
			"Run exactly this JS via run_js and then stop:",
			"```js",
			"const x = nonexistentFunctionXYZ();",
			"return x;",
			"```",
			"The ReferenceError is intentional. Do not catch it. Do not retry. Do not add anything else.",
		].join("\n");
		await sidePanel.locator('[data-testid="task-input"]').fill(refTask);
		await sidePanel.getByRole("button", { name: "Run task" }).click();

		const traceEntry = sidePanel.locator("[data-testid='trace-entry']").first();
		await traceEntry.waitFor({ state: "visible", timeout: 60_000 });

		await expect
			.poll(
				async () => {
					const txt = (await traceEntry.textContent()) ?? "";
					return /✓|✗/.test(txt);
				},
				{ timeout: 150_000, intervals: [2_000] },
			)
			.toBe(true);

		await traceEntry.click();
		const traceCard = sidePanel
			.locator("[data-testid='trace-entry']")
			.first()
			.locator("xpath=ancestor::div[contains(@class,'rounded-md')]");
		await expect(sidePanel.getByText("Result", { exact: true })).toBeVisible({
			timeout: 10_000,
		});
		const resultText = (await traceCard.textContent()) ?? "";
		console.log("DEEPSEEK_REF_TEXT_START");
		console.log(JSON.stringify(resultText));
		console.log("DEEPSEEK_REF_TEXT_END");

		writeFileSync(
			"/tmp/deepseek-referror-conversation.txt",
			apiRequests.map((e) => `--- ${e.direction} ---\n${e.body}`).join("\n"),
		);
		console.log(
			"Conversation saved to /tmp/deepseek-referror-conversation.txt",
		);

		// Bug 2: engine-thrown errors in QuickJS wasm32 have empty messages.
		// The error NAME must survive (ReferenceError), and the garbage stack
		// must NOT leak into the agent's view. Pre-fix the trace showed
		// "ReferenceError: )" with corrupt stack residue.
		expect(resultText).toContain("ReferenceError");
		expect(resultText).not.toContain("Stack)");

		await close();
	});
});
