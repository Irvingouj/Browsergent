# Browsergent - Technical Specification

## Purpose

This is the v1 implementation contract for Browsergent.

It defines:

```text
runtime ownership
message shapes
browser commands
snapshot format
error codes
agent-tool mapping
security rules
acceptance checks
```

## Platform Facts

| Capability | Rule |
|------------|------|
| Side panel | Use `"sidePanel"` permission |
| WASM in extension page | Allowed with `'wasm-unsafe-eval'` CSP |
| Web Worker | Start from side panel, not background |
| wasm-bindgen | Use `--target web` |
| Content script | Executes DOM actions in isolated world |
| `chrome.scripting` | Use with `activeTab` |
| Service worker | Routing only, no WASM, no long-running state |
| Eval | Forbidden |

## Runtime Ownership

```text
Side Panel UI
  chat, lua playbook editor, trace, status, settings

Worker
  pi-core WASM
  piccolo Lua WASM (required)
  Anthropic calls
  agent loop
  Lua runtime with page.* API
  stop/max-step control

Background
  active tab lookup
  content-script injection
  message routing

Content Script
  snapshot DOM
  keep ref_id map
  execute typed BrowserCommand (shared by agent and Lua)
```

| State | Owner |
|-------|-------|
| Agent transcript | pi-core in Worker |
| Lua VM state | piccolo WASM in Worker |
| Run status | Worker |
| API key | `chrome.storage.local` |
| Action trace | UI from Worker events (shared by agent and Lua) |
| ref_id map | Content script |
| Injection cache | Background |

## Manifest

```json
{
  "manifest_version": 3,
  "name": "Browsergent",
  "version": "0.1.0",
  "permissions": ["activeTab", "scripting", "sidePanel", "storage"],
  "host_permissions": [],
  "background": { "service_worker": "background.js" },
  "side_panel": { "default_path": "sidepanel.html" },
  "action": { "default_title": "Open Browsergent" },
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
}
```

Content scripts are injected dynamically.

## Type Rules

```text
No TypeScript any.
No TypeScript Object.
Use unknown only at external boundaries.
Narrow unknown immediately.
Use discriminated unions.
Represent failures as result objects.
Rust parses at first boundary.
pi-core remains sans-IO.
```

## Panel and Worker Messages

```typescript
type PanelToWorker =
  | { type: "agentStart"; task: string; maxSteps: number }
  | { type: "agentStop" }
  | { type: "agentReset" }
  | { type: "settingsUpdated"; settings: WorkerSettings }
  | { type: "luaRun"; id: string; code: string; stdin?: string }
  | { type: "luaStop" }
  | { type: "luaReset" };

interface WorkerSettings {
  anthropicApiKey?: string;
  model: string;
}

type WorkerToPanel =
  | { type: "workerReady" }
  | { type: "agentStatus"; status: AgentStatus; reason?: string }
  | { type: "agentMessage"; message: ChatMessage }
  | { type: "agentTextDelta"; messageId: string; text: string }
  | { type: "agentTrace"; entry: ActionTraceEntry }
  | { type: "agentError"; error: BrowsergentError }
  | { type: "luaOutput"; id: string; output: string }
  | { type: "luaTrace"; entry: ActionTraceEntry }
  | { type: "luaError"; id: string; error: string };

type AgentStatus =
  | "idle"
  | "loading"
  | "running"
  | "waiting_for_model"
  | "executing_tool"
  | "done"
  | "stopped"
  | "error";
```

## Browser Routing Messages

```typescript
type WorkerToBackground =
  | { type: "browserCommand"; command: BrowserCommand }
  | { type: "getActiveTab" };

type BackgroundToContent =
  | { type: "executeCommand"; command: BrowserCommand };

type BrowserCommandResponse =
  | { type: "commandResult"; result: BrowserResult };
```

## UI Domain Types

```typescript
type ChatMessage =
  | { kind: "user"; id: string; text: string; timestamp: number }
  | { kind: "assistant"; id: string; text: string; timestamp: number }
  | { kind: "system"; id: string; text: string; timestamp: number };

interface ActionTraceEntry {
  id: string;
  step: number;
  status: "running" | "done" | "error";
  command: BrowserCommand;
  result?: BrowserResult;
  timestamp: number;
}

interface BrowsergentError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
```

## BrowserCommand

```typescript
type BrowserCommand =
  | { kind: "page.snapshot"; options?: SnapshotOptions }
  | { kind: "page.click"; refId: RefId }
  | { kind: "page.fill"; refId: RefId; text: string }
  | { kind: "page.clear"; refId: RefId }
  | { kind: "page.select"; refId: RefId; value: string }
  | { kind: "page.press"; key: Key }
  | { kind: "page.scroll"; direction: Direction; amount?: number }
  | { kind: "page.extract"; refId?: RefId }
  | { kind: "page.goto"; url: string }
  | { kind: "page.back" }
  | { kind: "page.forward" }
  | { kind: "page.reload" };

type RefId = string;
type Direction = "up" | "down";
type Key = "Enter" | "Tab" | "Escape" | "Backspace" | string;

interface SnapshotOptions {
  onlyVisible?: boolean;
  maxElements?: number;
}
```

No v1 `tabs.*` commands.

## BrowserResult

```typescript
type BrowserResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string; code: ErrorCode; details?: Record<string, unknown> };

type ErrorCode =
  | "E_STALE"
  | "E_NOT_FOUND"
  | "E_NOT_INTERACTABLE"
  | "E_NOT_FILLABLE"
  | "E_NOT_SELECT"
  | "E_PERMISSION"
  | "E_NAVIGATION"
  | "E_UNSUPPORTED"
  | "E_UNKNOWN";
```

## PageSnapshot

```typescript
interface PageSnapshot {
  url: string;
  title: string;
  timestamp: number;
  elements: ReadonlyArray<ElementSnapshot>;
}

interface ElementSnapshot {
  refId: RefId;
  role: string;
  tag: string;
  text: string;
  label?: string;
  placeholder?: string;
  value?: string;
  enabled: boolean;
  visible: boolean;
  attributes?: Record<string, string>;
}
```

Snapshot rules:

```text
Include visible interactive elements by default.
Truncate element text to 200 characters.
Do not read password values.
Do not write data attributes into the page.
Use WeakMap<Element, RefId>.
Return E_STALE for disconnected refs.
```

Interactive elements:

```text
a[href], button, input, select, textarea, [role],
[contenteditable="true"], [onclick]
```

## Content Script Contract

The content script exposes:

```typescript
function executeCommand(command: BrowserCommand): BrowserResult;
```

Requirements:

```text
validate command kind and fields
resolve ref_id before element actions
check isConnected
check visibility and disabled state
dispatch input/change after fill, clear, select
return structured errors
never eval JavaScript
never accept CSS selectors
```

## Agent Tool Mapping

The LLM has ONE tool: `run_lua`. It generates Lua code to control the browser.

```json
{
  "name": "run_lua",
  "description": "Execute Lua code to control the browser. Available API:\n- page.snapshot() → returns page elements with ref_ids\n- page.click(ref_id) → click element\n- page.fill(ref_id, text) → fill input\n- page.clear(ref_id) → clear input\n- page.select(ref_id, value) → select option\n- page.press(key) → press key\n- page.scroll(direction, amount?) → scroll\n- page.extract(ref_id?) → extract text\n- page.goto(url) → navigate\n- page.back() / page.forward() / page.reload()",
  "input_schema": {
    "type": "object",
    "properties": {
      "code": { "type": "string", "description": "Lua code to execute" }
    },
    "required": ["code"]
  }
}
```

The LLM never calls page.* directly. It generates Lua code, and LuaRuntime executes it.

## Agent Loop

```text
1. Panel sends agentStart.
2. Worker calls pi-core start_turn.
3. StreamLlm -> Worker calls Anthropic.
4. Worker streams text to panel.
5. Worker calls pi-core on_llm_done.
6. ExecuteTools -> Worker extracts run_lua tool call.
7. Worker passes Lua code to LuaRuntime.run().
8. LuaRuntime executes: page.* calls yield BrowserCommands.
9. Worker sends BrowserCommands to background → content script.
10. Results resume back to Lua.
11. Lua execution completes, output returns as tool result.
12. Worker calls pi-core on_tool_done with Lua output.
13. Repeat until Finished, stopped, error, or maxSteps.
```

Core principle: LLM does reasoning (generates Lua code). Lua does acting (calls page.* APIs).

Step rules:

```text
One run_lua invocation = one step.
Default maxSteps = 20.
Stop cancels Anthropic fetch and prevents new browser commands.
Existing transcript and trace stay visible.
```

## Anthropic Rules

```text
Use Messages API.
Use streaming when available.
Convert pi-core messages to Anthropic messages.
Provide only one tool: run_lua.
Group consecutive tool_result messages into one user message.
Convert tool_use blocks back to pi-core ToolCall.
run_lua tool_use input contains Lua code, not direct browser commands.
Surface HTTP/network errors as agentError.
```

## Lua Mode

Lua is a required runtime and the **sole execution layer**. Both the agent (via `run_lua` tool) and direct user playbooks use the same Lua `page.*` API through the same BrowserCommand path. The product must support chat-driven agent use and manual Lua playbooks as first-class capabilities.

The LLM never calls browser tools directly. It generates Lua code. Lua calls `page.*` APIs. Each `page.*` call yields a BrowserCommand. BrowserCommand goes through the content script. Results resume back to Lua. This is the only execution path.

Allowed Lua page API:

```lua
page.snapshot(options)
page.click(ref_id)
page.fill(ref_id, text)
page.clear(ref_id)
page.select(ref_id, value)
page.press(key)
page.scroll(direction, amount)
page.extract(ref_id)
page.goto(url)
page.back()
page.forward()
page.reload()
```

## Security Rules

```text
No arbitrary page script execution.
No hidden actions.
No broad host permissions.
No CSS selectors from LLM or Lua.
Password values are never extracted.
Risky irreversible actions require explicit confirmation.
piccolo fuel limits Lua loops.
Agent max steps limits autonomous loops.
Stop is always available while running.
```

## Build Output

```text
dist/
  manifest.json
  sidepanel.html
  sidepanel.js
  worker.js
  background.js
  content-script.js
  pkg/
    browsergent_wasm.js
    browsergent_wasm_bg.wasm
    piccolo_notebook_wasm.js
    piccolo_notebook_wasm_bg.wasm
```

## Required Tests

```text
extension loads
worker loads pi-core WASM
worker loads piccolo Lua WASM
chat response
snapshot active tab
fill input
click button
select option
scroll page
extract text
invalid ref returns E_STALE
fake agent completes fill + click
Lua playbook completes fill + click
stop cancels run (agent and Lua)
```

## Acceptance

```text
cargo test --workspace passes
TypeScript checks pass
Playwright extension tests pass
extension loads unpacked
side panel chat works
Lua playbook editor works
page_snapshot works
page_fill and page_click modify page
trace records every command (agent and Lua)
agent completes one simple task
Lua playbook completes one simple task
stop works (agent and Lua)
no any/Object in TypeScript
no broad host_permissions
no arbitrary JS eval
```
