/**
 * Verifies the v0.9.x fixes landed end-to-end:
 *   1. page.tabs() returns objects with a numeric tabId field
 *   2. Thrown JS errors surface the full message + real stack frames in the trace
 *
 * Uses a mock Anthropic server to feed exact run_js code, avoiding LLM variability.
 */
import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	focusTargetTab,
	launchExtension,
	startMockAnthropicServer,
} from "./helpers";

const PROBE_CODE = `
const out = {};
try {
  const tabs = await page.tabs({});
  out.tabCount = tabs.length;
  out.firstTabKeys = Object.keys(tabs[0] || {}).sort();
  out.firstTabId = tabs[0]?.tabId;
  out.firstTabIdType = typeof tabs[0]?.tabId;
  out.firstTabChromeId = tabs[0]?.id;
} catch (e) {
  out.tabsError = { message: e.message, stack: String(e.stack || "").slice(0, 300) };
}
try {
  throw new Error("explicit foo");
} catch (e) {
  out.caughtError = {
    name: e.name,
    message: e.message,
    stackLen: (e.stack || "").length,
    stackHead: String(e.stack || "").slice(0, 300)
  };
}
try {
  // Engine-thrown ReferenceError — what does QuickJS wasm32 produce?
  out.engineRef = nonexistentVarXYZ;
} catch (e) {
  out.engineRefError = {
    name: e.name,
    message: e.message,
    messageLen: (e.message || "").length,
    messageJson: JSON.stringify(e.message || ""),
    stackLen: (e.stack || "").length,
    stackJson: JSON.stringify(e.stack || "").slice(0, 200)
  };
}
throw new Error("PROBE_DONE:" + JSON.stringify(out));
`;

function msgWithToolUse(id: string, code: string) {
	return [
		`event: message_start\ndata: ${JSON.stringify({
			type: "message_start",
			message: {
				id: "m1",
				type: "message",
				role: "assistant",
				content: [],
				model: "test",
				stop_reason: null,
				usage: { input_tokens: 10, output_tokens: 0 },
			},
		})}\n\n`,
		`event: content_block_start\ndata: ${JSON.stringify({
			type: "content_block_start",
			index: 0,
			content_block: { type: "tool_use", id, name: "run_js", input: {} },
		})}\n\n`,
		`event: content_block_delta\ndata: ${JSON.stringify({
			type: "content_block_delta",
			index: 0,
			delta: { type: "input_json_delta", partial_json: JSON.stringify({ code }) },
		})}\n\n`,
		`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
		`event: message_delta\ndata: ${JSON.stringify({
			type: "message_delta",
			delta: { stop_reason: "tool_use" },
		})}\n\n`,
		`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
	];
}

test("wasm probe: tabId + error stack content", async () => {
	test.setTimeout(90_000);
	const { sidePanel, context, close } = await launchExtension();

	// Open a target tab so page.tabs() has at least one entry to describe.
	const target = await context.newPage();
	await target.setContent(`<html><body><h1>target</h1></body></html>`);
	await focusTargetTab(target);

	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: msgWithToolUse("tc1", PROBE_CODE),
				delays: [0, 0, 0, 0, 0, 0],
				stopReason: "tool_use",
			},
			{
				// After the probe throws, agent loops back; just end the conversation.
				chunks: [
					`event: message_start\ndata: ${JSON.stringify({
						type: "message_start",
						message: {
							id: "m2",
							type: "message",
							role: "assistant",
							content: [],
							model: "test",
							stop_reason: null,
							usage: { input_tokens: 10, output_tokens: 0 },
						},
					})}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({
						type: "content_block_start",
						index: 0,
						content_block: { type: "text", text: "" },
					})}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({
						type: "content_block_delta",
						index: 0,
						delta: { type: "text_delta", text: "Done." },
					})}\n\n`,
					`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
					`event: message_delta\ndata: ${JSON.stringify({
						type: "message_delta",
						delta: { stop_reason: "end_turn" },
					})}\n\n`,
					`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
				],
				delays: [0, 0, 0, 0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});
	await configureMockProvider(sidePanel, mock.url, "test-key");

	await sidePanel.locator('[data-testid="task-input"]').fill("run probe");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	// Wait for the trace entry to appear and complete.
	const traceEntry = sidePanel.locator("[data-testid='trace-entry']").first();
	await traceEntry.waitFor({ state: "visible", timeout: 30_000 });
	// Wait for terminal status (✓ done or ✗ error).
	await expect
		.poll(
			async () => {
				const txt = (await traceEntry.textContent()) ?? "";
				return /✓|✗/.test(txt);
			},
			{ timeout: 60_000, intervals: [1_000] },
		)
		.toBe(true);

	// Read the trace result text via the DOM.
	await traceEntry.click();
	// The expanded body is a sibling of the testid'd button inside the trace card.
	const traceCard = sidePanel.locator("[data-testid='trace-entry']").first().locator("xpath=ancestor::div[contains(@class,'rounded-md')]");
	await expect(sidePanel.locator("text=Result")).toBeVisible({ timeout: 10_000 });
	const resultText = (await traceCard.textContent()) ?? "";
	console.log("TRACE_ENTRY_TEXT:", resultText);

	// The probe always throws PROBE_DONE:... so the trace should show that payload.
	expect(resultText).toContain("PROBE_DONE");

	// Bug 1: tabId must be present on the tab object as a number.
	expect(resultText).toContain('"firstTabIdType":"number"');
	expect(resultText).toMatch(/"firstTabId":\d+/);
	expect(resultText).toMatch(/"firstTabChromeId":\d+/);

	// Bug 2: the error MESSAGE must survive end-to-end (this was the actual
	// regression — empty `TypeError:` with no body). QuickJS's wasm32 backtrace
	// is intentionally disabled (see web-js-core globals.rs), so the stack field
	// itself is malformed — but the message reaching the agent is what matters.
	expect(resultText).toContain('"message":"explicit foo"');
	expect(resultText).toContain("PROBE_DONE:{");

	await mock.server.close();
	await close();
});
