import { expect, test } from "@playwright/test";
import { launchExtension } from "./helpers";

async function seedForeignWindowSession(
	sidePanel: import("@playwright/test").Page,
	foreignWindowId: number,
): Promise<string> {
	return sidePanel.evaluate(async (wid) => {
		const foreignId = crypto.randomUUID();
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const req = indexedDB.open("browsergent", 2);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		const tx = db.transaction("sessions", "readwrite");
		const store = tx.objectStore("sessions");
		store.put(
			{
				id: foreignId,
				windowId: wid,
				lifecycle: "foreground",
				messages: [
					{ kind: "user", id: "f1", text: "foreign window chat", timestamp: 1 },
				],
				trace: [],
				diagnostics: [],
				timestamp: Date.now(),
				messageCount: 1,
				title: "Foreign window session",
			},
			`session_${foreignId}`,
		);
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		db.close();
		return foreignId;
	}, foreignWindowId);
}

test.describe("window session isolation", () => {
	test("sidepanel exposes bound chrome window id", async () => {
		const { sidePanel, close } = await launchExtension();
		try {
			await expect(sidePanel.locator('[data-initialized="true"]')).toBeVisible();
			const windowId = await sidePanel
				.locator('[data-initialized="true"]')
				.getAttribute("data-window-id");
			expect(windowId).toBeTruthy();
			expect(Number(windowId)).toBeGreaterThan(0);
		} finally {
			await close();
		}
	});

	test("session list disables rows attached to another window", async () => {
		const { sidePanel, close } = await launchExtension();
		try {
			await expect(sidePanel.locator('[data-initialized="true"]')).toBeVisible();
			const panelWindowId = Number(
				await sidePanel
					.locator('[data-initialized="true"]')
					.getAttribute("data-window-id"),
			);
			const foreignWindowId = panelWindowId + 9_999;
			await seedForeignWindowSession(sidePanel, foreignWindowId);

			await sidePanel.getByRole("button", { name: "More options" }).click();
			await expect(
				sidePanel.locator('[data-testid="session-item"]').first(),
			).toBeVisible({ timeout: 5000 });

			const foreignRow = sidePanel.locator(
				'[data-testid="session-item"]:has-text("Foreign window session")',
			);
			await expect(foreignRow).toHaveAttribute(
				"data-session-openable",
				"false",
			);
			await expect(
				foreignRow.getByTestId("session-window-badge"),
			).toContainText(`Window ${foreignWindowId}`);
		} finally {
			await close();
		}
	});
});