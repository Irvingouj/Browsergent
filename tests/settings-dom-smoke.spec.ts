import { expect, test } from "@playwright/test";
import { launchExtension } from "./helpers";

test("settings via page.evaluate only", async () => {
	test.setTimeout(60_000);
	const { sidePanel, close } = await launchExtension();
	const log = (m: string) => console.log(`${Date.now()} ${m}`);
	log("launched");

	const clickBtn = async (name: string) => {
		const ok = await sidePanel.evaluate((n) => {
			const el = [...document.querySelectorAll("button")].find(
				(b) => b.textContent?.trim() === n,
			) as HTMLElement | undefined;
			if (!el) return false;
			el.click();
			return true;
		}, name);
		expect(ok).toBe(true);
	};
	const clickId = async (id: string) => {
		const ok = await sidePanel.evaluate((tid) => {
			const el = document.querySelector(
				`[data-testid="${tid}"]`,
			) as HTMLElement | null;
			if (!el) return false;
			el.click();
			return true;
		}, id);
		expect(ok).toBe(true);
	};

	await clickBtn("Settings");
	log("settings tab");
	await clickId("settings-add-provider");
	log("add provider");
	await new Promise((r) => setTimeout(r, 100));
	await clickId("settings-add-anthropic");
	log("picked anthropic");
	await new Promise((r) => setTimeout(r, 100));

	const filled = await sidePanel.evaluate(() => {
		const el = document.querySelector(
			'[data-testid="settings-apikey-input"]',
		) as HTMLInputElement | null;
		if (!el) return false;
		const desc = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		);
		desc?.set?.call(el, "test-key-123");
		el.dispatchEvent(new Event("input", { bubbles: true }));
		return true;
	});
	expect(filled).toBe(true);
	log("filled");
	await clickId("settings-done-button");
	log("done clicked");
	// Probe evaluate health
	const ping = await Promise.race([
		sidePanel.evaluate(() => "pong"),
		new Promise<string>((_, rej) =>
			setTimeout(() => rej(new Error("evaluate ping timeout")), 5_000),
		),
	]);
	log(`ping=${ping}`);
	const snap = await Promise.race([
		sidePanel.evaluate(() => ({
			list: !!document.querySelector('[data-testid="settings-list"]'),
			edit: !!document.querySelector('[data-testid="settings-edit"]'),
			text: document.body.innerText.slice(0, 200),
		})),
		new Promise<never>((_, rej) =>
			setTimeout(() => rej(new Error("snap timeout")), 5_000),
		),
	]);
	log(`snap=${JSON.stringify(snap)}`);
	expect(snap.list).toBe(true);

	await clickBtn("Chat");
	log("chat");
	await clickBtn("Settings");
	log("settings again");
	await sidePanel.evaluate(() => {
		(
			document.querySelector(
				'[data-testid^="settings-edit-"]',
			) as HTMLElement | null
		)?.click();
	});
	const apiKey = await sidePanel.evaluate(
		() =>
			(
				document.querySelector(
					'[data-testid="settings-apikey-input"]',
				) as HTMLInputElement | null
			)?.value ?? "",
	);
	log(`apiKey=${apiKey}`);
	expect(apiKey).toBe("test-key-123");
	await close();
});
