import { expect, test } from "@playwright/test";
import { DEFAULT_TAB_LIST_CODE } from "./fixtures/mock-llm-turns";
import {
	clickRun,
	configureMockOpenAIProvider,
	launchExtension,
	openAITextFrames,
	openAIToolOnlyRunJsFrames,
	startMockOpenAIServer,
	typeTask,
} from "./helpers";

/**
 * Same P0 contract as Anthropic mock, on OpenAI Chat Completions wire format
 * (matches real-user logs that use openai.sse_*).
 */
test("OpenAI mock: tool-only run_js then final assistant text", async () => {
	test.setTimeout(60_000);

	const finalAnswer = "OpenAI path: I see 3 open tabs.";
	const mock = startMockOpenAIServer({
		responses: [
			{
				frames: openAIToolOnlyRunJsFrames("call_tabs_1", DEFAULT_TAB_LIST_CODE),
			},
			{ frames: openAITextFrames(finalAnswer) },
		],
	});

	const { sidePanel, close } = await launchExtension();
	try {
		await configureMockOpenAIProvider(sidePanel, mock.url);
		await typeTask(sidePanel, "how many tabs openai path");
		await clickRun(sidePanel);

		await expect(
			sidePanel
				.locator('[data-testid="trace-entry"]')
				.filter({ hasText: "run_js" }),
		).toBeVisible({ timeout: 20_000 });

		await expect(
			sidePanel
				.locator('[data-testid="chat-message-assistant"]')
				.filter({ hasText: finalAnswer }),
		).toBeVisible({ timeout: 20_000 });

		await expect(sidePanel.getByTestId("agent-status")).toHaveText(/done/i, {
			timeout: 20_000,
		});
		expect(mock.requestBodies.length).toBeGreaterThanOrEqual(2);
	} finally {
		await close();
		mock.server.close();
	}
});
