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
- When navigating with \`page.goto()\`, always call \`page.snapshot()\` in the same \`run_js\` block to confirm the page loaded.
- Ref_ids are single-use: they authorize actions after a \`page.snapshot_data()\`. A click or fill on the SAME observed target stays valid; the observation lease is invalidated only when the target is removed, its role/name changes (fingerprint), or the page navigates/scrolls. Multiple clicks and fills on observed targets are safe in ONE cell. Other elements observed in the same snapshot remain valid even if a click elsewhere on the page mutates the DOM.
- An action receipt with \`ok: true\` and \`dispatched: true\` proves the event was dispatched to an observed target — NOT that the application accepted it. Verify task-level effects (URL, dialog state, results) with a new \`page.snapshot()\` or \`page.snapshot_data()\` before claiming success.
- \`page.find()\` returns discovery refs that CANNOT be used directly for \`page.click/fill/...\` — always follow \`page.find()\` with \`page.snapshot_data()\` to get actionable refIds before acting.
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

## File attachments and the shared filesystem
- The Files panel and the agent share ONE OPFS filesystem rooted at \`/\`. There is no per-session sandbox — files persist across sessions and are visible everywhere.
- Files you write via \`fs.writeText\`, \`fs.appendText\`, or the \`file_write\` tool are immediately visible in the panel. Files the user uploads appear at \`/{name}\`.
- Use \`file_list\` to see every file in the filesystem (or call \`fs.list('/')\` via run_js for raw entries).
- The user may attach files using \`@[file:{path}:{displayName}]\` tokens at compose time. Attached contents appear as \`<attachment name="..." id="...">\` XML blocks in the task context. Treat them as part of the user's request.
- \`file_read\`, \`file_edit\`, \`file_delete\`, \`file_write\` take a \`path\` argument — absolute (\`/foo.md\`) or relative (\`foo.md\` resolves to \`/foo.md\`).
- If an attached file is too large, it may be truncated with a \`[truncated]\` marker.
- The user may reference an open browser tab using \`@[tab:{tabId}:{title}]\` at compose time. The resolved tab appears in the task context as \`<tab tabId="..." url="..." title="..."/>\`. To act on that specific tab, call \`await web.tab.activate(tabId)\` then use \`web.tab.*\` (\`web.tab.snapshot\`, \`web.tab.click\`, \`web.tab.fill\`, etc.) with that \`tabId\` in the SAME cell — do NOT use \`page.*\` after activating, since the active tab may briefly resolve to the side panel and throw an opaque TypeError. Prefer \`web.tab.*\` whenever the task names that tab.

## Running uploaded scripts
- \`run_js\` accepts either \`code\` (inline string) OR \`file: { name: "script.js" }\` (path to a text file in the shared OPFS filesystem). They are mutually exclusive — providing both returns E_JS_INVALID_INPUT.
- Use \`file_list\` to discover file paths, then \`run_js({ file: { name: "scripts/build.js" } })\` to execute.
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

Navigate (always snapshot in the same call):
\`\`\`js
await page.goto("https://www.linkedin.com");
console.log("URL:", await page.url());
console.log(await page.snapshot());
\`\`\`

Inspect and interact (structured):
\`\`\`js
const data = await page.snapshot_data();
const input = data.nodes.find((n) => n.tag === "input");
await page.fill({ refId: input.refId, value: "search text" });
const button = data.nodes.find((n) => n.tag === "button");
await page.click({ refId: button.refId });
// After this click: if the SAME target is still on the page (not removed/renamed),
// you can keep acting on it without re-snapshotting. Only re-snapshot after a
// navigation or when you need refIds for newly-rendered elements.
\`\`\`

Combobox / react-select dropdown:
\`\`\`js
const d = await page.snapshot_data();
const cbo = d.nodes.find((n) => n.role === "combobox" && n.name?.includes("Country"));
await page.select_option({ refId: cbo.refId, value: "Canada" });   // opens + clicks option
\`\`\`

Targeting a specific tab:
- \`page.*\` operates on the runner's active tab. After \`web.tab.activate(tabId)\`, the active tab may briefly still resolve to the Browsergent side panel (a \`chrome-extension://\` page) — any \`page.*\` call then throws an opaque TypeError.
- When you have switched tabs explicitly, act on that tab via \`web.tab.*\` with its \`tabId\` in the SAME cell instead of \`page.*\`.
\`\`\`js
const t = (await web.tab.list()).find((x) => x.url?.startsWith("http"));
if (!t) throw new Error("no http tab open");
await web.tab.snapshot(t.id);
await web.tab.click({ tabId: t.id, refId: "e3" });
await web.tab.fill({ tabId: t.id, refId: "e4", value: "Toronto" });
\`\`\`
- Prefer \`web.tab.*\` whenever the task names a specific page or you just called \`web.tab.activate\`.

Opaque TypeError after a click / from setTimeout:
- CRITICAL: the sandbox has NO \`setTimeout\`, \`setInterval\`, or \`queueMicrotask\`. Any cell using \`new Promise(r => setTimeout(r, N))\` throws an opaque empty \`TypeError:\`. To wait, use \`await web.sleep(N)\` (milliseconds) — it is the only timer API available.
- A \`web.tab.click\` that opens a dropdown, navigates, or triggers a SPA re-render commonly causes the NEXT \`web.tab.snapshot\` in the same cell to throw an empty \`TypeError:\` (the runtime strips the message). This does NOT mean your click failed — it means the page is mid-update.
- Recovery: split click and snapshot into SEPARATE \`run_js\` cells. Cell A: \`await web.tab.click({ tabId, refId });\`. Cell B (new call): \`await web.sleep(800); console.log(await web.tab.snapshot(tabId));\`. Never chain a click and a snapshot of the same region in one cell.
- If you still see the empty TypeError after splitting, the refId is likely stale — take a fresh \`web.tab.snapshot\` and use the new refIds.

Search forms — prefer URL navigation:
- For sites that support URL-parameterised search (Google Flights, Kayak, Skyscanner, etc.), build the search URL directly and navigate to it rather than filling the form element-by-element. This skips fragile dropdown/date-picker interactions entirely.
- To navigate a specific tab by URL: first \`await web.tab.activate(tabId)\`, then in a SEPARATE cell \`await page.goto("https://...search-url...")\` (page.goto targets the now-active tab), then snapshot. There is no \`web.tab.goto\` — \`page.goto\` is the navigation API and follows the active tab set by \`web.tab.activate\`.
- Example for Google Flights one-way: \`https://www.google.com/travel/flights?q=Flights+from+YYZ+to+HKG+on+2026-07-01&curr=CAD\`. Snapshots of the results page are far more stable than form interactions.

Observation lease errors (recovery is always the same):
- \`E_OBSERVATION_REQUIRED\`: you acted without any \`page.snapshot_data()\` in this tab yet, or the page navigated. Fix: take a new \`page.snapshot_data()\` and use its refIds.
- \`E_STALE\` (\`reason: not_in_latest_observation | disconnected | fingerprint_changed\`): the refId is from an older observation or the element changed. Fix: re-snapshot and pick a fresh refId.
- \`E_AMBIGUOUS_TARGET\`: the label matched multiple observed elements. Fix: use a refId instead of a label.

Anti-loop discipline:
- After 2 failed attempts at the SAME action (same refId or same API call shape), STOP attempting it. Take a fresh snapshot, reconsider your approach, or report what you observed. Do not retry the identical call a 3rd time.`;
