import { expect, test } from "@playwright/test";
import {
	domClickButton,
	domClickSelector,
	domClickTestId,
	domFillTestId,
	launchExtension,
} from "./helpers";

async function waitForTestId(
	page: import("@playwright/test").Page,
	testId: string,
	timeoutMs = 10_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const found = await page.evaluate(
			(id) => !!document.querySelector(`[data-testid="${id}"]`),
			testId,
		);
		if (found) return;
		await new Promise((r) => setTimeout(r, 50));
	}
	throw new Error(`waitForTestId: ${testId}`);
}

test("rapid endpoint and API-key edits preserve both provider values", async () => {
	const { sidePanel, close } = await launchExtension();
	try {
		await domClickButton(sidePanel, "Settings");
		await waitForTestId(sidePanel, "settings-list");
		await domClickTestId(sidePanel, "settings-add-provider");
		await domClickTestId(sidePanel, "settings-add-anthropic");
		await waitForTestId(sidePanel, "settings-edit");

		const endpoint = "http://127.0.0.1:45678/v1/messages";
		const apiKey = "test-key";
		await sidePanel.evaluate(
			({ endpoint, apiKey }) => {
				const setInput = (testId: string, value: string): void => {
					const input = document.querySelector(
						`[data-testid="${testId}"]`,
					) as HTMLInputElement | null;
					if (!input) throw new Error(`Missing input: ${testId}`);
					const setter = Object.getOwnPropertyDescriptor(
						HTMLInputElement.prototype,
						"value",
					)?.set;
					if (!setter) throw new Error("Input value setter unavailable");
					setter.call(input, value);
					input.dispatchEvent(new Event("input", { bubbles: true }));
				};
				setInput("settings-baseurl-input", endpoint);
				setInput("settings-apikey-input", apiKey);
			},
			{ endpoint, apiKey },
		);

		await domClickTestId(sidePanel, "settings-done-button");
		await waitForTestId(sidePanel, "settings-list");
		await domClickSelector(sidePanel, '[data-testid^="settings-edit-"]');
		await waitForTestId(sidePanel, "settings-edit");
		const savedValues = await sidePanel.evaluate(() => ({
			endpoint: (
				document.querySelector(
					'[data-testid="settings-baseurl-input"]',
				) as HTMLInputElement | null
			)?.value,
			apiKey: (
				document.querySelector(
					'[data-testid="settings-apikey-input"]',
				) as HTMLInputElement | null
			)?.value,
		}));
		expect(savedValues).toEqual({ endpoint, apiKey });
	} finally {
		await close();
	}
});

test("settings save and load within a session", async () => {
	const { sidePanel, close } = await launchExtension();

	await domClickButton(sidePanel, "Settings");
	await waitForTestId(sidePanel, "settings-list");
	await domClickTestId(sidePanel, "settings-add-provider");
	await waitForTestId(sidePanel, "settings-add-anthropic-compatible");
	await domClickTestId(sidePanel, "settings-add-anthropic-compatible");
	await waitForTestId(sidePanel, "settings-edit");
	await domFillTestId(sidePanel, "settings-apikey-input", "sk-test-key");
	await domFillTestId(
		sidePanel,
		"settings-baseurl-input",
		"https://custom.example.com/v1/messages",
	);
	await domFillTestId(sidePanel, "settings-model-input", "claude-test-model");
	await domClickTestId(sidePanel, "settings-add-model-button");
	await domClickTestId(sidePanel, "settings-done-button");
	await waitForTestId(sidePanel, "settings-list");

	await domClickButton(sidePanel, "Chat");
	await domClickButton(sidePanel, "Settings");
	await waitForTestId(sidePanel, "settings-list");
	await domClickSelector(sidePanel, '[data-testid^="settings-edit-"]');
	await waitForTestId(sidePanel, "settings-edit");

	const values = await sidePanel.evaluate(() => {
		const apiKey = (
			document.querySelector(
				'[data-testid="settings-apikey-input"]',
			) as HTMLInputElement | null
		)?.value;
		const baseUrl = (
			document.querySelector(
				'[data-testid="settings-baseurl-input"]',
			) as HTMLInputElement | null
		)?.value;
		const options = [
			...document.querySelectorAll(
				'[data-testid="settings-default-model-select"] option',
			),
		].map((o) => o.textContent ?? "");
		return { apiKey, baseUrl, options };
	});
	expect(values.apiKey).toBe("sk-test-key");
	expect(values.baseUrl).toBe("https://custom.example.com/v1/messages");
	expect(values.options.some((t) => t.includes("claude-test-model"))).toBe(
		true,
	);

	await close();
});
