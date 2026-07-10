import { expect, test } from "@playwright/test";
import {
	launchExtension,
	openSecondWindow,
	readPanelWindowId,
} from "./helpers";

test("second window becomes shell-ready while first stays open", async () => {
	// Second panel often falls open to memory within ~1.5s when IDB is contended;
	// shell ready is marked via chrome.storage.session (avoids frozen page CDP).
	test.setTimeout(120_000);
	const { context, extensionId, sidePanel: panelA, close } =
		await launchExtension();
	try {
		// Capture A window id BEFORE opening B — evaluate on A freezes after dual open.
		const windowA = await readPanelWindowId(panelA);
		expect(windowA).toBeGreaterThan(0);

		const t0 = Date.now();
		const { windowId: windowB } = await openSecondWindow(
			context,
			extensionId,
			panelA,
		);
		const elapsed = Date.now() - t0;
		console.log("second window ready in", elapsed, "ms", "windowB", windowB);
		expect(windowB).toBeGreaterThan(0);
		expect(windowA).not.toBe(windowB);
		// Non-blocking IDB: shell should paint well under a minute even when IDB is slow.
		expect(elapsed).toBeLessThan(90_000);
	} finally {
		await Promise.race([
			close(),
			new Promise((r) => setTimeout(r, 15_000)),
		]);
	}
});
