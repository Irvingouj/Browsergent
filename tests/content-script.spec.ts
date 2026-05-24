import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { launchExtension, createTestPage } from "./helpers";

const TEST_FORM_HTML = `
<!DOCTYPE html>
<html>
<body>
  <form id="test-form">
    <label for="email">Email</label>
    <input type="email" id="email" name="email" placeholder="Enter email" />
    <label for="name">Name</label>
    <input type="text" id="name" name="name" />
    <label for="color">Color</label>
    <select id="color" name="color">
      <option value="red">Red</option>
      <option value="blue">Blue</option>
      <option value="green">Green</option>
    </select>
    <button type="submit" id="submit-btn">Submit</button>
  </form>
  <div id="result"></div>
  <script>
    document.getElementById('test-form').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('result').textContent =
        'Submitted: email=' + document.getElementById('email').value +
        ' name=' + document.getElementById('name').value;
    });
  </script>
</body>
</html>
`;

interface SnapshotResult {
  ok: true;
  value: {
    elements: Array<{ refId: string; tag: string; placeholder?: string; text: string }>;
  };
}

async function injectBuiltContentScript(page: Page): Promise<void> {
  const scriptContent = await fs.readFile(path.resolve("dist/content-script.js"), "utf8");
  await page.evaluate(scriptContent);
}

test("content script snapshot returns interactive elements", async () => {
  const { context, close } = await launchExtension();
  const testPage = await createTestPage(context, TEST_FORM_HTML);
  await injectBuiltContentScript(testPage);

  const snapshotResult = await testPage.evaluate(() => {
    return (window as unknown as { __browsergentExecuteCommand: (command: unknown) => unknown })
      .__browsergentExecuteCommand({ kind: "page.snapshot" });
  }) as SnapshotResult;

  expect(snapshotResult.ok).toBe(true);
  expect(snapshotResult.value.elements.map((el) => el.tag)).toEqual(
    expect.arrayContaining(["input", "select", "button"]),
  );
  expect(snapshotResult.value.elements.every((el) => /^e\d+$/.test(el.refId))).toBe(true);

  await close();
});

test("content script fill and click modify real page", async () => {
  const { context, close } = await launchExtension();
  const testPage = await createTestPage(context, TEST_FORM_HTML);
  await injectBuiltContentScript(testPage);

  const snapshotResult = await testPage.evaluate(() => {
    return (window as unknown as { __browsergentExecuteCommand: (command: unknown) => unknown })
      .__browsergentExecuteCommand({ kind: "page.snapshot" });
  }) as SnapshotResult;

  const email = snapshotResult.value.elements.find((el) => el.placeholder === "Enter email");
  const submit = snapshotResult.value.elements.find((el) => el.tag === "button" && el.text === "Submit");
  expect(email).toBeDefined();
  expect(submit).toBeDefined();

  await testPage.evaluate((refId) => {
    return (window as unknown as { __browsergentExecuteCommand: (command: unknown) => unknown })
      .__browsergentExecuteCommand({ kind: "page.fill", refId, text: "test@example.com" });
  }, email?.refId);
  await testPage.evaluate((refId) => {
    return (window as unknown as { __browsergentExecuteCommand: (command: unknown) => unknown })
      .__browsergentExecuteCommand({ kind: "page.click", refId });
  }, submit?.refId);

  await expect(testPage.locator("#result")).toContainText("test@example.com");

  await close();
});
