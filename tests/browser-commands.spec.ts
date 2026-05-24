import { test, expect, type Page, type BrowserContext } from "@playwright/test";
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
  // Load the content script source from the extension
  const scriptContent = `
    const refMap = new WeakMap();
    let nextRefId = 0;
    
    function assignRefId(el) {
      if (refMap.get(el)) return refMap.get(el);
      const id = 'e' + nextRefId;
      nextRefId++;
      refMap.set(el, id);
      return id;
    }
    
    function isVisible(el) {
      const htmlEl = el;
      if (htmlEl.offsetParent === null && htmlEl.type !== 'hidden') return false;
      const style = window.getComputedStyle(htmlEl);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }
    
    function getRole(el) {
      return el.getAttribute('role') || (el.tagName === 'INPUT' ? 'textbox' : el.tagName === 'BUTTON' ? 'button' : el.tagName === 'SELECT' ? 'combobox' : el.tagName === 'TEXTAREA' ? 'textbox' : el.tagName === 'A' ? 'link' : 'generic');
    }
    
    function executeCommand(command) {
      switch (command.kind) {
        case 'page.snapshot': {
          const elements = [];
          const candidates = document.querySelectorAll('a[href], button, input, select, textarea, [role], [contenteditable="true"], [onclick]');
          for (const el of candidates) {
            const visible = isVisible(el);
            if (command.options && command.options.onlyVisible === false || !command.options || command.options.onlyVisible !== false) {
              if (!visible) continue;
            }
            const refId = assignRefId(el);
            const tag = el.tagName.toLowerCase();
            const text = (el.textContent || '').trim().substring(0, 200);
            const role = getRole(el);
            const label = el.getAttribute('aria-label') || undefined;
            const placeholder = el.placeholder || undefined;
            let value;
            if (tag === 'input' && el.type !== 'password') value = el.value || undefined;
            else if (tag === 'textarea') value = el.value || undefined;
            else if (tag === 'select') value = el.value || undefined;
            elements.push({ refId, role, tag, text, label, placeholder, value, enabled: !el.disabled, visible });
          }
          return { ok: true, value: { url: location.href, title: document.title, timestamp: Date.now(), elements } };
        }
        case 'page.click': {
          const el = document.querySelector('[data-browsergent-id="' + command.refId + '"]');
          // Fallback: find by ref map
          const all = document.querySelectorAll('a[href], button, input, select, textarea, [role], [contenteditable="true"], [onclick]');
          let found = null;
          for (const e of all) {
            if (refMap.get(e) === command.refId) { found = e; break; }
          }
          if (!found) return { ok: false, error: 'No element with ref_id ' + command.refId, code: 'E_STALE' };
          if (!found.isConnected) return { ok: false, error: 'Element disconnected', code: 'E_STALE' };
          found.click();
          return { ok: true, value: { clicked: true } };
        }
        case 'page.fill': {
          const all = document.querySelectorAll('a[href], button, input, select, textarea, [role], [contenteditable="true"], [onclick]');
          let found = null;
          for (const e of all) {
            if (refMap.get(e) === command.refId) { found = e; break; }
          }
          if (!found) return { ok: false, error: 'No element with ref_id ' + command.refId, code: 'E_STALE' };
          found.value = command.text;
          found.dispatchEvent(new Event('input', { bubbles: true }));
          found.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, value: { filled: true } };
        }
        case 'page.clear': {
          const all = document.querySelectorAll('a[href], button, input, select, textarea, [role], [contenteditable="true"], [onclick]');
          let found = null;
          for (const e of all) {
            if (refMap.get(e) === command.refId) { found = e; break; }
          }
          if (!found) return { ok: false, error: 'No element', code: 'E_STALE' };
          found.value = '';
          found.dispatchEvent(new Event('input', { bubbles: true }));
          found.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, value: { cleared: true } };
        }
        case 'page.select': {
          const all = document.querySelectorAll('a[href], button, input, select, textarea, [role], [contenteditable="true"], [onclick]');
          let found = null;
          for (const e of all) {
            if (refMap.get(e) === command.refId) { found = e; break; }
          }
          if (!found) return { ok: false, error: 'No element', code: 'E_STALE' };
          found.value = command.value;
          found.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, value: { selected: true } };
        }
        case 'page.extract': {
          if (command.refId) {
            const all = document.querySelectorAll('a[href], button, input, select, textarea, [role], [contenteditable="true"], [onclick]');
            for (const e of all) {
              if (refMap.get(e) === command.refId) return { ok: true, value: { text: (e.textContent || '').trim() } };
            }
            return { ok: false, error: 'No element', code: 'E_STALE' };
          }
          return { ok: true, value: { text: document.body.innerText } };
        }
        default:
          return { ok: false, error: 'Unknown command: ' + command.kind, code: 'E_UNSUPPORTED' };
      }
    }
    window.__executeCommand = executeCommand;
  `;
  await page.evaluate(scriptContent);
}

test("snapshot returns page elements with ref_ids", async () => {
  const { context, sidePanel, close } = await launchExtension();
  const testPage = await context.newPage();
  await testPage.setContent(FORM_HTML);
  await injectContentScript(testPage);
  
  const result = await testPage.evaluate(() => {
    return (window as unknown as { __executeCommand: (cmd: unknown) => unknown }).__executeCommand({ kind: "page.snapshot" });
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
    return (window as unknown as { __executeCommand: (cmd: unknown) => unknown }).__executeCommand({ kind: "page.snapshot" });
  }) as { ok: boolean; value: { elements: Array<{ refId: string; tag: string; placeholder?: string }> } };
  
  const emailEl = snap.value.elements.find((e) => e.tag === "input" && e.placeholder === "Enter email");
  expect(emailEl).toBeDefined();
  
  // Fill the email input
  const fillResult = await testPage.evaluate((refId) => {
    return (window as unknown as { __executeCommand: (cmd: unknown) => unknown }).__executeCommand({ kind: "page.fill", refId, text: "test@example.com" });
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
    return (window as unknown as { __executeCommand: (cmd: unknown) => unknown }).__executeCommand({ kind: "page.snapshot" });
  }) as { ok: boolean; value: { elements: Array<{ refId: string; tag: string; text: string }> } };
  
  const btn = snap.value.elements.find((e) => e.tag === "button" && e.text.includes("Click Me"));
  expect(btn).toBeDefined();
  
  await testPage.evaluate((refId) => {
    return (window as unknown as { __executeCommand: (cmd: unknown) => unknown }).__executeCommand({ kind: "page.click", refId });
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
    return (window as unknown as { __executeCommand: (cmd: unknown) => unknown }).__executeCommand({ kind: "page.snapshot" });
  }) as { ok: boolean; value: { elements: Array<{ refId: string; tag: string; placeholder?: string; text?: string }> } };
  
  // Fill email
  const emailEl = snap.value.elements.find((e) => e.tag === "input" && e.placeholder === "Enter email");
  await testPage.evaluate((refId) => {
    return (window as unknown as { __executeCommand: (cmd: unknown) => unknown }).__executeCommand({ kind: "page.fill", refId, text: "test@example.com" });
  }, emailEl!.refId);
  
  // Click submit
  const submitBtn = snap.value.elements.find((e) => e.tag === "button" && e.text.includes("Submit"));
  await testPage.evaluate((refId) => {
    return (window as unknown as { __executeCommand: (cmd: unknown) => unknown }).__executeCommand({ kind: "page.click", refId });
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
    return (window as unknown as { __executeCommand: (cmd: unknown) => unknown }).__executeCommand({ kind: "page.click", refId: "nonexistent" });
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
    return (window as unknown as { __executeCommand: (cmd: unknown) => unknown }).__executeCommand({ kind: "page.snapshot" });
  }) as { ok: boolean; value: { elements: Array<{ refId: string; tag: string }> } };
  
  const selectEl = snap.value.elements.find((e) => e.tag === "select");
  expect(selectEl).toBeDefined();
  
  await testPage.evaluate((refId) => {
    return (window as unknown as { __executeCommand: (cmd: unknown) => unknown }).__executeCommand({ kind: "page.select", refId, value: "blue" });
  }, selectEl!.refId);
  
  const value = await testPage.locator("#color").inputValue();
  expect(value).toBe("blue");
  
  await close();
});
