import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { launchExtension } from "./helpers";

const FORM_HTML = `
<!DOCTYPE html>
<html>
<body>
  <form id="form">
    <label for="email">Email</label>
    <input type="email" id="email" name="email" placeholder="Enter email" />
    <label for="password">Password</label>
    <input type="password" id="password" name="password" />
    <label for="name">Name</label>
    <input type="text" id="name" name="name" value="initial" />
    <label for="color">Color</label>
    <select id="color" name="color">
      <option value="red">Red</option>
      <option value="blue">Blue</option>
    </select>
    <textarea id="notes"></textarea>
    <button type="button" id="btn">Click Me</button>
    <button type="submit" id="submit">Submit</button>
  </form>
  <div id="click-log"></div>
  <div id="result"></div>
  <script>
    document.getElementById('btn').addEventListener('click', () => {
      document.getElementById('click-log').textContent = 'clicked';
    });
    document.getElementById('form').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('result').textContent = 
        'email=' + document.getElementById('email').value + 
        ' name=' + document.getElementById('name').value;
    });
  </script>
</body>
</html>
`;

/** Inject content script into a page and return the executeCommand function. */
async function injectContentScript(page: Page): Promise<void> {
  const scriptContent = await fs.readFile(path.resolve("dist/content-script.js"), "utf8");
  await page.evaluate(scriptContent);
}

test("snapshot returns page elements with ref_ids", async () => {
  const { context, sidePanel, close } = await launchExtension();
  const testPage = await context.newPage();
  await testPage.setContent(FORM_HTML);
  await injectContentScript(testPage);
  
  const result = await testPage.evaluate(() => {
    return (window as unknown as { __browsergentExecuteCommand: (cmd: unknown) => unknown }).__browsergentExecuteCommand({ kind: "page.snapshot" });
  }) as { ok: boolean; value: { elements: Array<{ refId: string; tag: string; role: string; enabled: boolean }> } };
  
  expect(result.ok).toBe(true);
  expect(result.value.elements.length).toBeGreaterThanOrEqual(5);
  
  const tags = result.value.elements.map((e) => e.tag);
  expect(tags).toContain("input");
  expect(tags).toContain("button");
  expect(tags).toContain("select");
  expect(tags).toContain("textarea");
  
  for (const el of result.value.elements) {
    expect(el.refId).toMatch(/^e\d+$/);
    expect(el.enabled).toBe(true);
  }
  
  await close();
});

test("fill modifies input value", async () => {
  const { context, sidePanel, close } = await launchExtension();
  const testPage = await context.newPage();
  await testPage.setContent(FORM_HTML);
  await injectContentScript(testPage);
  
  // First snapshot to get ref_ids
  const snap = await testPage.evaluate(() => {
    return (window as unknown as { __browsergentExecuteCommand: (cmd: unknown) => unknown }).__browsergentExecuteCommand({ kind: "page.snapshot" });
  }) as { ok: boolean; value: { elements: Array<{ refId: string; tag: string; placeholder?: string }> } };
  
  const emailEl = snap.value.elements.find((e) => e.tag === "input" && e.placeholder === "Enter email");
  expect(emailEl).toBeDefined();
  
  // Fill the email input
  const fillResult = await testPage.evaluate((refId) => {
    return (window as unknown as { __browsergentExecuteCommand: (cmd: unknown) => unknown }).__browsergentExecuteCommand({ kind: "page.fill", refId, text: "test@example.com" });
  }, emailEl!.refId) as { ok: boolean };
  
  expect(fillResult.ok).toBe(true);
  
  // Verify value was set
  const value = await testPage.locator("#email").inputValue();
  expect(value).toBe("test@example.com");
  
  await close();
});

test("click triggers button handler", async () => {
  const { context, sidePanel, close } = await launchExtension();
  const testPage = await context.newPage();
  await testPage.setContent(FORM_HTML);
  await injectContentScript(testPage);
  
  const snap = await testPage.evaluate(() => {
    return (window as unknown as { __browsergentExecuteCommand: (cmd: unknown) => unknown }).__browsergentExecuteCommand({ kind: "page.snapshot" });
  }) as { ok: boolean; value: { elements: Array<{ refId: string; tag: string; text: string }> } };
  
  const btn = snap.value.elements.find((e) => e.tag === "button" && e.text.includes("Click Me"));
  expect(btn).toBeDefined();
  
  await testPage.evaluate((refId) => {
    return (window as unknown as { __browsergentExecuteCommand: (cmd: unknown) => unknown }).__browsergentExecuteCommand({ kind: "page.click", refId });
  }, btn!.refId);
  
  await expect(testPage.locator("#click-log")).toHaveText("clicked");
  
  await close();
});

test("fill and submit completes workflow", async () => {
  const { context, sidePanel, close } = await launchExtension();
  const testPage = await context.newPage();
  await testPage.setContent(FORM_HTML);
  await injectContentScript(testPage);
  
  // Snapshot
  const snap = await testPage.evaluate(() => {
    return (window as unknown as { __browsergentExecuteCommand: (cmd: unknown) => unknown }).__browsergentExecuteCommand({ kind: "page.snapshot" });
  }) as { ok: boolean; value: { elements: Array<{ refId: string; tag: string; placeholder?: string; text?: string }> } };
  
  // Fill email
  const emailEl = snap.value.elements.find((e) => e.tag === "input" && e.placeholder === "Enter email");
  await testPage.evaluate((refId) => {
    return (window as unknown as { __browsergentExecuteCommand: (cmd: unknown) => unknown }).__browsergentExecuteCommand({ kind: "page.fill", refId, text: "test@example.com" });
  }, emailEl!.refId);
  
  // Click submit
  const submitBtn = snap.value.elements.find((e) => e.tag === "button" && e.text.includes("Submit"));
  await testPage.evaluate((refId) => {
    return (window as unknown as { __browsergentExecuteCommand: (cmd: unknown) => unknown }).__browsergentExecuteCommand({ kind: "page.click", refId });
  }, submitBtn!.refId);
  
  // Verify submission
  await expect(testPage.locator("#result")).toHaveText("email=test@example.com name=initial");
  
  await close();
});

test("stale ref returns E_STALE", async () => {
  const { context, sidePanel, close } = await launchExtension();
  const testPage = await context.newPage();
  await testPage.setContent(FORM_HTML);
  await injectContentScript(testPage);
  
  const result = await testPage.evaluate(() => {
    return (window as unknown as { __browsergentExecuteCommand: (cmd: unknown) => unknown }).__browsergentExecuteCommand({ kind: "page.click", refId: "nonexistent" });
  }) as { ok: boolean; error: string; code: string };
  
  expect(result.ok).toBe(false);
  expect(result.code).toBe("E_STALE");
  
  await close();
});

test("select changes dropdown value", async () => {
  const { context, sidePanel, close } = await launchExtension();
  const testPage = await context.newPage();
  await testPage.setContent(FORM_HTML);
  await injectContentScript(testPage);
  
  const snap = await testPage.evaluate(() => {
    return (window as unknown as { __browsergentExecuteCommand: (cmd: unknown) => unknown }).__browsergentExecuteCommand({ kind: "page.snapshot" });
  }) as { ok: boolean; value: { elements: Array<{ refId: string; tag: string }> } };
  
  const selectEl = snap.value.elements.find((e) => e.tag === "select");
  expect(selectEl).toBeDefined();
  
  await testPage.evaluate((refId) => {
    return (window as unknown as { __browsergentExecuteCommand: (cmd: unknown) => unknown }).__browsergentExecuteCommand({ kind: "page.select", refId, value: "blue" });
  }, selectEl!.refId);
  
  const value = await testPage.locator("#color").inputValue();
  expect(value).toBe("blue");
  
  await close();
});
