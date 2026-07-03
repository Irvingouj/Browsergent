import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	launchExtension,
	startSimpleMockProvider,
	typeTask,
} from "./helpers";

test("right-click chat bubble shows Copy menu and copies message text", async () => {
	test.setTimeout(60000);

	const mock = startSimpleMockProvider();
	const { sidePanel, close } = await launchExtension();

	// Stub clipboard — chrome-extension:// is an opaque origin so real
	// clipboard permissions can't be granted in tests.
	await sidePanel.evaluate(() => {
		let lastCopied = "";
		const w = window as unknown as { __lastCopied: string };
		Object.defineProperty(navigator, "clipboard", {
			value: {
				writeText: async (text: string) => {
					lastCopied = text;
					w.__lastCopied = text;
				},
				readText: async () => lastCopied,
			},
			configurable: true,
		});
	});

	await configureMockProvider(sidePanel, mock.url);

	await typeTask(sidePanel, "do the thing");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	const userBubble = sidePanel.locator('[data-testid="chat-message-user"]');
	await expect(userBubble).toBeVisible({ timeout: 5000 });

	const assistantBubble = sidePanel.locator(
		'[data-testid="chat-message-assistant"]',
	);
	await expect(assistantBubble).toBeVisible({ timeout: 10000 });

	// Right-click the user message.
	await userBubble.click({ button: "right" });
	await expect(sidePanel.getByTestId("chat-context-menu")).toBeVisible({
		timeout: 3000,
	});

	const copyButton = sidePanel
		.getByTestId("chat-context-menu")
		.getByRole("button", { name: "Copy" });
	await expect(copyButton).toBeVisible();
	await copyButton.click();

	const userClip = await sidePanel.evaluate(
		() =>
			(window as unknown as { __lastCopied: string | undefined }).__lastCopied,
	);
	expect(userClip).toContain("do the thing");

	// Menu closes after copy.
	await expect(sidePanel.getByTestId("chat-context-menu")).toHaveCount(0);

	// Right-click the assistant message and copy it.
	await assistantBubble.click({ button: "right" });
	await expect(sidePanel.getByTestId("chat-context-menu")).toBeVisible();
	await sidePanel
		.getByTestId("chat-context-menu")
		.getByRole("button", { name: "Copy" })
		.click();
	const assistantClip = await sidePanel.evaluate(
		() =>
			(window as unknown as { __lastCopied: string | undefined }).__lastCopied,
	);
	expect(assistantClip).toContain("Done.");

	await close();
	mock.server.close();
});
