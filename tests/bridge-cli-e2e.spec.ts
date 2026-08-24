import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { BridgeCli } from "../host/bridge-cli";
import { postBridgeRequest } from "../host/bridge-http";
import { BridgeServer } from "../host/bridge-server";
import {
	domClickButton,
	domClickTestId,
	focusTargetTab,
	launchExtension,
} from "./helpers";

test.describe.serial("CLI bridge", () => {
	test.setTimeout(120_000);
	let server: BridgeServer;

	test.beforeAll(async () => {
		server = new BridgeServer();
		await server.listen(8787);
	});

	test.afterAll(async () => {
		await server.stop();
	});

	test("CLI enrolls from the Enroll tab and run_js executes in the live sidepanel", async () => {
		const configDir = await mkdtemp(join(tmpdir(), "browsergent-bridge-"));
		const { sidePanel, close } = await launchExtension();
		try {
			const cli = await enrollCli(sidePanel, configDir);
			expect(await cli.status()).toEqual({ connected: true, enrolled: true });
			expect(await cli.run("1 + 1")).toContain("2");
			expect(await cli.docs("page")).toMatch(/page\.click|page\.snapshot/i);
		} finally {
			await close();
		}
	});

	test("CLI run_js snapshots the live tab, lists the session, and disables Chat input", async () => {
		const { url, server: pageServer } = await startPageServer();
		const { context, sidePanel, close } = await launchExtension();
		try {
			const target = await context.newPage();
			await target.goto(url);
			await focusTargetTab(target);
			const cli = await enrollCli(sidePanel);
			await focusTargetTab(target);
			const snapshot = await cli.run(
				"const s = await page.snapshot(); console.log(s); s",
			);
			expect(snapshot).toMatch(/Bridge target/i);

			await sidePanel.evaluate(() => {
				const more = [...document.querySelectorAll("button")].find(
					(button) => button.getAttribute("title") === "More options",
				) as HTMLElement | undefined;
				more?.click();
			});
			const cliRow = sidePanel.locator(
				'[data-testid="session-item"][data-session-origin="cli"]',
			);
			await expect(cliRow).toHaveCount(1, { timeout: 10_000 });
			await sidePanel.evaluate(() => {
				(
					document.querySelector(
						'[data-testid="session-item"][data-session-origin="cli"]',
					) as HTMLElement | null
				)?.click();
			});

			await domClickButton(sidePanel, "Chat");
			await expect(
				sidePanel.locator('[data-testid="task-input"]'),
			).toHaveAttribute("aria-disabled", "true");
			await expect(
				sidePanel.locator('[data-testid="run-button"]'),
			).toHaveCount(0);
			await expect(
				sidePanel.locator('[data-testid="trace-entry"]'),
			).toContainText("run_js");
		} finally {
			await close();
			pageServer.close();
		}
	});

	test("CLI file_write appears in the Files panel", async () => {
		const { sidePanel, close } = await launchExtension();
		try {
			const cli = await enrollCli(sidePanel);
			expect(await cli.writeFile("/bridge-note.md", "from cli")).toMatch(
				/Wrote \/bridge-note\.md/,
			);
			await domClickButton(sidePanel, "Files");
			await expect(
				sidePanel.locator('[data-testid="tree-file"]', {
					hasText: "bridge-note.md",
				}),
			).toBeVisible({ timeout: 10_000 });
			await sidePanel.evaluate(() => {
				const row = [
					...document.querySelectorAll('[data-testid="tree-file"]'),
				].find((el) => el.textContent?.includes("bridge-note.md")) as
					| HTMLElement
					| undefined;
				row?.click();
			});
			await expect(
				sidePanel.locator('[data-testid="file-preview"]'),
			).toContainText("from cli", { timeout: 10_000 });
		} finally {
			await close();
		}
	});
});

async function enrollCli(
	sidePanel: Page,
	configDir?: string,
): Promise<BridgeCli> {
	const dir =
		configDir ?? (await mkdtemp(join(tmpdir(), "browsergent-bridge-")));
	await domClickButton(sidePanel, "Enroll");
	await expect(
		sidePanel.locator('[data-testid="enroll-generate"]'),
	).toBeVisible({ timeout: 15_000 });
	await expect(
		sidePanel.locator('[data-testid="enroll-status"]'),
	).toHaveAttribute("data-enroll-connected", "true", { timeout: 15_000 });
	await domClickTestId(sidePanel, "enroll-generate");
	const tokenLocator = sidePanel.locator('[data-testid="enroll-token"]');
	await expect(tokenLocator).toBeVisible({ timeout: 15_000 });
	const token = (await tokenLocator.textContent())?.trim();
	if (!token) throw new Error("Enroll tab did not show a token");
	const cli = new BridgeCli({
		configDir: dir,
		send: (request) =>
			postBridgeRequest("http://127.0.0.1:8787/bridge", request),
	});
	await cli.enroll(token);
	return cli;
}

function startPageServer(): Promise<{
	url: string;
	server: ReturnType<typeof createServer>;
}> {
	return new Promise((resolve) => {
		const server = createServer((_req, res) => {
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(
				"<!DOCTYPE html><html><body><h1>Bridge target</h1></body></html>",
			);
		});
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port =
				typeof address === "object" && address !== null ? address.port : 0;
			resolve({ url: `http://127.0.0.1:${port}`, server });
		});
	});
}
