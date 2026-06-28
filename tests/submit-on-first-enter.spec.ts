import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	extractFirstUserMessageText,
	launchExtension,
	startSimpleMockProvider,
} from "./helpers";

// Regression: after the zipper refactor, typing did not sync store.taskDraft
// (by design — Draft is screen truth). But handleRun closed over the render-time
// taskInput snapshot, so the FIRST Enter dispatched submit (which wrote the
// store) then called onRun() synchronously — onRun read the stale empty
// snapshot and returned early. User had to hit Enter twice. Same staleness
// broke the Run button after typing.
//
// Fix: handleRun reads taskDraft LIVE from the store, not from its closure.

test("typing then a single Enter submits the typed text", async () => {
	test.setTimeout(60000);
	const mock = startSimpleMockProvider();
	const { sidePanel, close } = await launchExtension();
	await configureMockProvider(sidePanel, mock.url);

	const input = sidePanel.locator('[data-testid="task-input"]');
	await input.click();
	await input.type("send me once");

	// Enter once. Pre-fix this no-op'd (stale empty taskDraft in handleRun).
	await input.press("Enter");

	await expect(sidePanel.getByTestId("agent-status")).toHaveText("done", {
		timeout: 30000,
	});

	// The first provider request must carry the typed text as the user message
	// — proves submit fired on the first Enter with the live value.
	expect(mock.requestBodies.length).toBeGreaterThanOrEqual(1);
	const text = extractFirstUserMessageText(mock.requestBodies[0]);
	expect(text).toBe("send me once");

	await close();
	mock.server.close();
});

test("typing then clicking Run once submits the typed text", async () => {
	test.setTimeout(60000);
	const mock = startSimpleMockProvider();
	const { sidePanel, close } = await launchExtension();
	await configureMockProvider(sidePanel, mock.url);

	const input = sidePanel.locator('[data-testid="task-input"]');
	await input.click();
	await input.type("click me once");

	await sidePanel.getByRole("button", { name: "Run task" }).click();

	await expect(sidePanel.getByTestId("agent-status")).toHaveText("done", {
		timeout: 30000,
	});

	expect(mock.requestBodies.length).toBeGreaterThanOrEqual(1);
	const text = extractFirstUserMessageText(mock.requestBodies[0]);
	expect(text).toBe("click me once");

	await close();
	mock.server.close();
});
