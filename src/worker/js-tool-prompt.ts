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
- \`page.find()\` results may omit DOM attributes such as \`src\`, \`href\`, and \`alt\`, and may have a null \`refId\`. Inspect the returned shape before relying on those fields.
- \`page.fetch()\` returns a text body, not binary bytes or base64. Do not use it to save images or other binary files unless a documented binary-safe API provides the bytes.
- fs.* APIs are accessed through the fs object: \`fs.exists()\`, \`fs.readText()\`, \`fs.writeText()\`, \`fs.list()\`, etc. Call get_doc with namespace='fs' for exact names.

## Execution model
- Each \`run_js\` call is an isolated async cell. Top-level \`let\`, \`const\`, and \`var\` do NOT persist across calls.
- Prefer one block with multiple \`await\`s when the sequence is clear.
- Cross-call state must use \`globalThis._bg\` (e.g., \`globalThis._bg.counter = 1\`).
- Initialize cross-call state before writing it: \`globalThis._bg ??= {};\`.
- Re-fetch or re-initialize any local bindings you need in each cell.
- The last expression may appear in the tool result; use \`console.log\` for observations.

## File attachments
- The user may attach files using \`@[file:{fileId}:{displayName}]\` tokens. Attached file contents appear as \`<attachment name="..." id="...">\` XML blocks in the task context.
- Treat attached files as part of the user's request — read, analyze, or modify them as instructed.
- If a file is too large, it may be truncated with a \`[truncated]\` marker.

## Running uploaded scripts
- \`run_js\` accepts either \`code\` (inline string) OR \`file: { name: "script.js" }\` (uploaded file). They are mutually exclusive — providing both returns E_JS_INVALID_INPUT.
- Use \`file_list\` to discover uploaded file names, then \`run_js({ file: { name: "script.js" } })\` to execute.
- The file's text content becomes the cell body. Same execution model applies: isolated cell, no cross-call locals, top-level bindings do not persist.
- Binary files (images, archives) are rejected with E_FILE_BINARY. Only text files can be executed.
- \`@[file:...]\` attachments (mentioned above) inject file content into the task context for analysis. \`run_js({ file })\` is different: it executes the file as JS code.

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
const input = data.nodes.find((n) => n.tag === "input");
await page.fill({ refId: input.refId, value: "search text" });
const button = data.nodes.find((n) => n.tag === "button");
await page.click({ refId: button.refId });
// await page.type({ refId: input.refId, text: "..." });
// await page.press("Enter");
// await page.select({ refId: input.refId, value: "option1" });
// await page.check({ refId: input.refId, checked: true });
// await page.scroll({ direction: "down", amount: 300 });
\`\`\``;
