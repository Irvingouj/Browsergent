import { chromium, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, "../dist");

export async function launchExtension(): Promise<{
  context: BrowserContext;
  extensionId: string;
  sidePanel: Page;
  close: () => Promise<void>;
}> {
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker");
  }
  const extensionId = serviceWorker.url().split("/")[2];

  const sidePanel = await context.newPage();
  await sidePanel.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  return { context, extensionId, sidePanel, close: async () => await context.close() };
}

export async function createTestPage(context: BrowserContext, html: string): Promise<Page> {
  const page = await context.newPage();
  await page.setContent(html);
  return page;
}
