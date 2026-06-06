/**
 * Single source of truth for the run_js tool description.
 * Imported by both the agent-tools definition and the Anthropic system prompt.
 */

export const JS_TOOL_PROMPT = `Execute JavaScript code to control the browser via the extension-js runtime.
ALWAYS call get_doc first when you need any page.*, web.*, chrome.*, or fs API. Do not guess function names, argument shapes, or return types.

## Browsergent-specific rules
- The target web page is controlled through page.* APIs.
- Use \`await page.snapshot()\` to get a human-readable page summary for observation.
- Use \`await page.snapshot_data()\` only when you need structured element nodes with ref_ids.
- Use \`await page.url()\` and \`await page.title()\` for page metadata.
- Use \`await page.goto(url)\` to navigate/open a URL when the user asks to go somewhere.
- Ref_ids from snapshot_data are snapshot-scoped. Never guess them, and refresh the snapshot_data before acting if the page changed.
- You can combine multiple page.* calls in one async function block when the sequence is clear.
- Use \`console.log(...)\` or \`web.log(...)\` to return concise observations to the trace.
- Use page.* for target-tab automation. Use sidepanel.* only when explicitly controlling Browsergent's side panel.
- Do not use \`page.evaluate\`, \`chrome.scripting.executeScript\`, or \`tab.evaluate\`; Browsergent forbids arbitrary JS execution outside the sandboxed runtime.

## Common patterns
Current page:
\`\`\`js
const tabId = await page.active_tab();
console.log("Tab:", tabId);
console.log("URL:", await page.url());
console.log("Title:", await page.title());
console.log(await page.snapshot());
\`\`\`

Navigate:
\`\`\`js
await page.goto("https://www.linkedin.com");
\`\`\`

Inspect and interact (structured):
\`\`\`js
const data = await page.snapshot_data();
// choose a real ref_id from data, then:
// await page.fill("e3", "search text");
// await page.click("e4");
// await page.type(ref_id, text);
// await page.press(key);
// await page.select(ref_id, value);
// await page.check(ref_id);
// await page.scroll(direction, amount);
\`\`\``;
