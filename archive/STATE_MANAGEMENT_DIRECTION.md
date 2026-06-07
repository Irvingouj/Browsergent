<!-- Historical document — kept for reference. See CONTEXT.md for current state. -->

# Browsergent State Management Direction

Browsergent is starting to lose track because state is split across too many places:

```text
Side panel Preact state
  messages, settings, status, trace, Lua output

Browsergent Worker globals
  currentApiKey, currentModel, conversationHistory, active AgentLoop

pi-host-web Agent state
  canonical agent messages, streaming state, tool state

extension-lua session
  Lua VM globals, execution count, pending async command loop

Chrome storage
  settings only
```

This makes behavior hard to reason about. A chat message can exist in UI state but not in pi-host-web. A worker can think the agent is running while the UI is idle. Lua can be ready or broken while the UI has no explicit state for it.

## Recommendation

Use **Zustand** for Browsergent application state.

Do not use Redux. Browsergent is a side panel extension with a compact state graph; Redux adds too much ceremony. Preact signals are available, but the problem is not rendering speed. The problem is unclear ownership and lifecycle.

Zustand is a good fit because:

- It is small and readable.
- It works with Preact.
- It can be used outside components, including worker message handlers.
- It supports clear state slices.
- It can persist selected state to `chrome.storage.local` or IndexedDB.

The goal is not to put every runtime detail into Zustand. The goal is to make Browsergent UI/application state transitions explicit and centralized.

## Target Ownership

```text
Zustand app store
  Owns UI/application state:
  - rendered chat messages
  - streaming assistant draft
  - agent status
  - settings
  - trace entries
  - Lua readiness
  - Lua output
  - persisted session snapshot pointer

pi-host-web
  Owns canonical agent reasoning state during a run:
  - message graph
  - streaming events
  - tool calls
  - session state export/import

extension-lua
  Owns Lua runtime state:
  - Lua globals
  - execution count
  - async command loop
  - Chrome/tab/content-script adapter

Browsergent Worker
  Owns execution only:
  - active AgentLoop
  - AbortController
  - pending Lua relay map
  - no durable transcript
  - no long-lived settings source of truth
```

## Store Shape

Recommended slices:

```ts
interface AppStore {
  settings: SettingsSlice;
  chat: ChatSlice;
  agent: AgentSlice;
  lua: LuaSlice;
  trace: TraceSlice;
}
```

### Settings Slice

```ts
interface SettingsSlice {
  apiKey: string;
  baseUrl: string;
  model: string;
  loaded: boolean;
  loadSettings(): Promise<void>;
  saveSettings(next: SettingsState): Promise<void>;
}
```

Settings are persisted to Chrome storage. The store owns the loaded values. The worker receives settings for the current run only.

### Chat Slice

```ts
interface ChatSlice {
  messages: ChatMessage[];
  appendUser(text: string): void;
  startAssistant(id: string): void;
  appendAssistantDelta(id: string, delta: string): void;
  finalizeAssistant(id: string): void;
  appendSystemError(message: string): void;
  resetChat(): void;
}
```

The UI should not manually append streaming deltas inside `app.tsx`. Worker events should go through store actions.

### Agent Slice

```ts
type AgentStatus =
  | "idle"
  | "loading"
  | "running"
  | "executing_tool"
  | "done"
  | "stopped"
  | "error";

interface AgentSlice {
  status: AgentStatus;
  statusReason?: string;
  activeRunId?: string;
  maxSteps: number;
  startRun(task: string): void;
  stopRun(): void;
  finishRun(): void;
  failRun(message: string): void;
}
```

Stop must be immediate from the UI perspective. Clicking Stop should synchronously transition the app store to `stopped`, then tell the worker to abort.

### Lua Slice

```ts
type LuaStatus =
  | "uninitialized"
  | "initializing"
  | "ready"
  | "running"
  | "error"
  | "disposed";

interface LuaSlice {
  status: LuaStatus;
  error?: string;
  output: string;
  init(): Promise<void>;
  runCell(code: string): Promise<void>;
  appendOutput(text: string): void;
  resetOutput(): void;
  dispose(): Promise<void>;
}
```

The UI must not allow Lua execution while `status !== "ready"`. This removes the current `ExtensionLuaClient not initialized` race.

### Trace Slice

```ts
interface TraceSlice {
  entries: AgentTraceEntry[];
  startTool(entry: AgentTraceEntry): void;
  finishTool(id: string, result: string): void;
  failTool(id: string, error: string): void;
  resetTrace(): void;
}
```

Tool trace should be updated, not only appended. A running trace entry should become done/error when the result returns.

## Event Flow

Avoid ad hoc state mutation inside `app.tsx`.

Bad direction:

```ts
worker.onmessage = (event) => {
  switch (event.data.type) {
    case "agentTextDelta":
      setMessages(...);
      break;
  }
};
```

Good direction:

```ts
worker.onmessage = (event) => {
  appActions.handleWorkerMessage(event.data);
};
```

All worker message semantics should live in one bridge/controller layer.

Recommended modules:

```text
src/state/store.ts
src/state/settings-slice.ts
src/state/chat-slice.ts
src/state/agent-slice.ts
src/state/lua-slice.ts
src/state/trace-slice.ts

src/controllers/worker-bridge.ts
src/controllers/agent-controller.ts
src/controllers/lua-session-controller.ts
```

## Controller Responsibilities

### WorkerBridge

Owns:

- Worker creation and termination.
- `postMessage`.
- Worker message dispatch into store actions.
- Reconnection behavior if the worker crashes.

Does not own:

- Chat history.
- Settings.
- Lua runtime state.

### AgentController

Owns:

- Start/stop/reset commands.
- Sending current settings to the worker for a run.
- Updating agent slice.

Does not own:

- Agent transcript persistence.
- LLM provider internals.

### LuaSessionController

Owns:

- `ExtensionSession.init()`.
- `runCellAsync`.
- `stopWith`.
- Safe-mode/static scanning.
- Serializing Lua runs.

Does not own:

- UI messages.
- Agent tool result conversion.

## pi-host-web Session State

Long term, pi-host-web session state should be the canonical agent transcript.

Target:

```text
pi-host-web getSessionState()
  -> persist to Chrome storage / IndexedDB

side panel opens
  -> load persisted session state
  -> setSessionState()
  -> project messages into Zustand chat slice
```

Avoid maintaining a separate durable `conversationHistory` in the worker. Worker memory disappears when the worker restarts and can diverge from pi-host-web state.

## Lua Tool Result Adapter

Add a dedicated module:

```text
src/worker/lua-tool-result.ts
```

Responsibilities:

```text
CellResult
  -> check error
  -> format stdout/stderr/result into useful text
  -> project large output with projectContext()
  -> return toolResult(text) or toolError(code, message)
```

Do not spread this logic across `agent-loop.ts`, `extension-lua.ts`, and UI code.

## Prompt API Source

Do not manually maintain a long `tab.*` API list in `anthropic.ts`.

`@pi-oxide/extension-lua` ships generated API material:

```text
node_modules/@pi-oxide/extension-lua/dist/api.json
node_modules/@pi-oxide/extension-lua/dist/API.md
```

Browsergent should either:

- generate the prompt API section from `api.json`, or
- keep a small curated prompt file with a test that verifies every documented API exists in `api.json`.

This prevents prompt drift.

## Immediate Cleanup Order

1. Fix build asset copy:

```text
node_modules/@pi-oxide/extension-lua/dist/content-script.js
  -> dist/content-script.js
```

2. Split test ownership:

```text
tests/e2e/*.spec.ts       -> Playwright
tests/unit/*.spec.ts      -> Vitest
tests/smoke/*.spec.ts     -> explicit command only
```

At minimum, Playwright must ignore Vitest-only smoke tests.

3. Add Zustand store and move UI state transitions out of `app.tsx`.

4. Add explicit Lua readiness state and gate `Run Lua` / agent `run_lua` relay on it.

5. Fix target tab binding. `tab.current()` must refer to the user target tab, not the side panel page.

6. Fix tool-result continuation. After `run_lua`, the agent must continue to the next LLM turn when the model stopped with `tool_use`.

7. Add `projectContext()` in Lua tool result adapter.

8. Persist pi-host-web session state and hydrate chat UI from it.

## Success Criteria

The refactor is not done until:

```bash
npm run typecheck
npm run build
npm run test:unit
npx playwright test
```

all pass, and the following user-visible behaviors work:

- Side panel opens without Lua init race.
- Lua playbook can read the active target page URL/title.
- Agent can answer "what page are we at?" using `run_lua`.
- Assistant text streams incrementally.
- Chat history remains visible across turns.
- Tool call result causes the agent to continue to a final answer.
- Stop preserves partial streamed text and immediately shows stopped status.
- Build output contains `dist/content-script.js`.
