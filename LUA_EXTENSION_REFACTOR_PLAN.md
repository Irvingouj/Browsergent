# Browsergent Lua / Pi Host Refactor Plan

本文档记录 Browsergent 从旧 `piccolo-notebook-wasm` Lua 集成迁移到新 `@pi-oxide/extension-lua` + `@pi-oxide/pi-host-web` 架构的重构计划。

## 目标

Browsergent 不再拥有 Lua runtime 的内部执行循环，也不再维护 Lua action 到 browser command 的本地映射。

目标边界：

```text
Browsergent
  = UI + LLM provider + agent orchestration glue

@pi-oxide/pi-host-web
  = pi-core agent state machine

@pi-oxide/extension-lua
  = Lua runtime + async command loop + Chrome/tab/content-script host adapter
```

最终 Browsergent 应该只把 Lua code 交给 `extension-lua`，然后拿回 cell result。Browsergent 不应该再理解 `page_snapshot`、`page_click`、`resume_cell`、`pending_command` 这些 Lua runtime 内部细节。

## 当前旧用法

Browsergent 现在仍然有旧 Lua adapter：

```text
LLM
  -> run_lua tool
  -> src/worker/lua-runtime.ts
  -> @pi-oxide/piccolo-notebook-wasm run_cell/resume_cell
  -> pending_command action string
  -> Browsergent mapLuaToCommand
  -> BrowserCommand
  -> background/content script
```

这个结构的问题：

- Browsergent 需要同步维护 `web-lua` 的 action 名字。
- 新增 `page.url()`、`page.title()`、`page.wait()` 时，Browsergent 必须同步加 mapping，否则运行时失败。
- `lua-runtime.ts` 同时承担 VM loop、host command routing、Browsergent 自定义 Lua library，边界太厚。
- `BROWSERGENT_PAGE_LIBRARY` 通过 `host.call("browsergent_page_clear")` 覆盖 Lua API，说明 Browsergent 已经侵入了 Lua runtime 层。

## 新包期望用法

`@pi-oxide/extension-lua` 的目标用法是：

```text
Browsergent calls ExtensionSession.runCellAsync(lua)
  -> extension-lua runs piccolo internally
  -> extension-lua handles async pending/resume internally
  -> extension-lua runner calls chrome.tabs / chrome.scripting / content script
  -> extension-lua returns final cell result
```

Browsergent 不再看到中间 action，也不再把 action string 转成自己的 `BrowserCommand`。

## 推荐目标架构

`@pi-oxide/pi-host-web` 已经适合留在 Browsergent Worker 里，因为它负责 agent state machine。

`@pi-oxide/extension-lua` 的 public `ExtensionSession.init()` 当前是 side panel 主线程 API。它内部会创建自己的 Worker，并把 Chrome side effects relay 回主线程 runner。因为真正的 `chrome.tabs.*`、`chrome.scripting.*`、content script 注入都必须在 extension 页面上下文执行。

所以推荐结构是：

```text
Side Panel UI main thread
  ├─ owns ExtensionSession.init()
  ├─ executes Lua through extension-lua
  │
  └─ Browsergent Worker
       ├─ owns AgentLoop
       ├─ owns @pi-oxide/pi-host-web
       └─ asks main thread to run Lua
```

AgentLoop 仍然留在 Worker 中，避免 agent loop 和 LLM network flow 干扰 UI。Lua 的 public session 入口放在 side panel 主线程，因为 `extension-lua` runner 需要主线程 Chrome extension API 环境。

## 分阶段重构计划

### Phase 1: dependency switch

这是硬性入口条件，不是后续优化：Browsergent 必须安装并使用已发布的 `extension-lua`，同时把 `@pi-oxide/pi-host-web` 对齐到最新 SDK 形态。

注意 package 名字：正确包名是 scoped `@pi-oxide/pi-host-web`。npm 上存在误发布的 unscoped `pi-host-web@0.2.0` / `pi-host-web@0.2.1`，Browsergent 不应依赖这些 orphan packages。

实现前先确认 registry / artifact：

```bash
npm view @pi-oxide/extension-lua version
npm view @pi-oxide/pi-host-web version
```

然后执行依赖切换：

```bash
npm uninstall @pi-oxide/piccolo-notebook-wasm
npm install @pi-oxide/extension-lua@latest @pi-oxide/pi-host-web@latest
```

如果 `@pi-oxide/pi-host-web@latest` 不是 SDK v2 形态，即 package root 没有导出 `Agent`、`toolResult`、`projectContext`、`getSessionState` / `setSessionState`，则迁移必须先暂停。不要继续基于旧 raw WASM API 做重复封装。需要先发布或安装正确 artifact。

旧 Lua package 必须移除：

```json
"@pi-oxide/piccolo-notebook-wasm"
```

新 Lua package 必须加入：

```json
"@pi-oxide/extension-lua"
```

`@pi-oxide/pi-host-web` 必须升级到最新 SDK 形态，并从 package root 使用：

```ts
import { Agent, projectContext, toolResult } from "@pi-oxide/pi-host-web";
```

同时确认以下 build 和 manifest 要求：

**content-script.js**：`extension-lua` 的 `sendMessageToTab` 在 content script 不存在时会自动注入 `content-script.js`（fallback，最多重试 5 次）。因此 dist 里应该包含这个文件，但它不是 blocker —— `tab.snapshot` 和 `tab.fetch` 已改用 `executeInTab`（inline JS），不依赖 content script；只有 `tab.click` / `tab.fill` / `tab.scroll_to` 走 content script relay。

**manifest permissions**：`extension-lua` 要求以下权限（源码：`runner.ts` 中 `handleChromeApi` 调用的 Chrome API）：

```json
["tabs", "activeTab", "scripting"]
```

Browsergent 第一阶段完整权限列表：

```json
["tabs", "activeTab", "scripting", "sidePanel", "storage"]
```

注意 `tabs` 是之前计划遗漏的 —— 没有 `tabs` 权限，`tab.current()` / `tab.url()` / `tab.snapshot()` 全部失败。

**CSP**：extension-lua WASM 需要 `'wasm-unsafe-eval'`，`tab.fetch` / `runtime.fetch` 需要 `connect-src`：

```
script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src *;
```

**bundle size**：`extension-lua` npm tarball ~1.9 MB gzipped / ~7.1 MB unpacked。迁移后需要做一次 `du -sh dist/` 对比，确保 Vite 没有把 `web-lua`（~8.3 MB unpacked）意外拖进 bundle。

### Phase 2: create side panel Lua client

新增一个 side panel 主线程 adapter，例如：

```text
src/sidepanel/extension-lua-client.ts
```

职责：

- 调用 `ExtensionSession.init()`，持有 session / runner lifecycle。
- 提供 `runLua(code): Promise<CellResult>`。
- 提供 reset / dispose（调用 `session.stopWith(runner)` 清理内部 Worker）。
- 通过 `session.loadLibrary(source)` 加载 Browsergent 自定义 Lua 函数（替代旧的 `BROWSERGENT_PAGE_LIBRARY`）。
- 在调用 `runCellAsync` 前做静态安全扫描：拒绝包含 `tab.evaluate`、`tab.execute_script`、`chrome.scripting.executeScript` 的代码。
- 不解释 Lua command。
- 不把 Lua action 转 BrowserCommand。

**必须是单例**：`extension-lua` 的 runner 使用模块级 `AbortController`（源码：`runner.ts` 顶层变量），多个 `ExtensionSession` 实例的 `stopWith` 会互相覆盖。每个 extension page 只应有一个活跃 session。

**同时服务 agent 和 standalone Lua tab**：当前 Browsergent Worker 维护两个独立的 `LuaRuntime` —— 一个给 agent `run_lua` tool，一个给 UI 的 Lua 标签页。迁移后两者共享同一个 `ExtensionSession`，通过队列序列化访问：

```ts
class ExtensionLuaClient {
  private static instance: ExtensionLuaClient | null = null;
  private session: ExtensionSession;
  private runner: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();

  async runLua(code: string): Promise<CellResult> {
    // 序列化：agent 和 standalone Lua tab 不能并发执行
    return this.queue = this.queue.then(() => this.session.runCellAsync(code));
  }
}
```

这个 adapter 是 Browsergent 和 `extension-lua` 的唯一 Lua runtime 入口。

### Phase 3: add worker-to-sidepanel Lua relay

Browsergent Worker 中的 AgentLoop 遇到 LLM tool call `run_lua` 时，不再直接跑本地 `LuaRuntime`。Standalone Lua tab 的 `luaRun` 消息也走同一条路径。

改成：

```text
Worker -> Side Panel (agent path):
  { type: "luaRunRequest", id, code }

Worker -> Side Panel (standalone Lua tab path):
  { type: "luaRun", id, code }  // 复用现有消息类型，但改为 relay 到 extension-lua

Side Panel:
  extensionLuaClient.runLua(code)  // 单例，队列序列化

Side Panel -> Worker:
  { type: "luaRunResult", id, result }
```

Relay 协议需要加超时机制：如果 `runCellAsync` hang 住（例如 `tab.wait_for_load` 在已加载页面上永远等待），AgentLoop 需要能中断。建议加 30s timeout，超时后调用 `session.stopWith(runner)` 并重建 session。

这样 AgentLoop 可以继续留在 Worker 里，但真正的 `ExtensionSession` 由 side panel 主线程的单例 adapter 持有。

### Phase 4: simplify AgentLoop Lua boundary

当前 AgentLoop 依赖旧 `LuaRuntime.run(code, callbacks)`。

目标改成 SDK v2 风格的 tool map，而不是硬编码一个特殊 Lua path：

```ts
type ToolHandlers = Record<string, (call: ToolCall) => Promise<ToolResult>>;
```

Browsergent v1 只注册一个 tool：

```ts
const tools = {
  run_lua: async (call) => {
    const code = parseRunLuaCode(call);
    const cell = await extensionLua.runCellAsync(code);
    const text = formatLuaCellResult(cell);
    const projected = projectContextForToolResult(text);
    return toolResult(projected);
  },
};
```

Agent loop 只知道：

```text
LLM requested run_lua
  -> dispatch tools.run_lua(call)
  -> send ToolResult back to pi-host-web
```

AgentLoop 不知道：

- Lua VM 如何 resume。
- Chrome command 如何执行。
- content script 如何注入。
- `page_snapshot` 这种内部 action 名字。

`runCellAsync` 的 raw result 不能直接丢回 agent。Browsergent wrapper 必须把它转换成 SDK `toolResult(text)` 需要的文本 payload。

实际的 `CellResult` 类型（源码：`crates/web-lua-base/src/types.rs`，通过 `tsify` 生成 TypeScript 类型）：

```ts
interface CellResult {
  stdout: string[];              // 注意：是数组，不是单个字符串
  stderr: string[];              // 注意：是数组
  result: string | null;         // JSON 序列化的 Lua 返回值，不是 any
  error: WasmCellError | null;   // 注意：是 discriminated union，不是 string
  execution_count: number;
}

type WasmCellError =
  | { kind: "compile"; message: string; line: number | null }
  | { kind: "runtime"; message: string }
  | { kind: "strict_mode"; variable: string }
  | { kind: "fuel_exhausted" }
  | { kind: "internal"; message: string };
```

转换逻辑：

```text
CellResult
  -> if error: format by kind (compile→line number, fuel_exhausted→loop warning, etc.)
  -> join stdout[] with newlines
  -> append result if present
  -> projectContext by token budget
  -> toolResult(text)
```

Browsergent 可以利用 error kind 做差异化处理：
- `compile` → 告诉 LLM 哪行有语法错误，LLM 可自行修正
- `fuel_exhausted` → 提示 LLM 可能是死循环，建议换方法
- `runtime` → 可能是 refId 过期，建议先 snapshot 刷新

### Phase 5: delete old Browsergent Lua runtime

迁移完成后删除：

```text
src/worker/lua-runtime.ts
```

同时删除相关旧逻辑：

- `mapLuaToCommand`
- `host.call("browsergent_*")`
- `pending_command` / `async_pending` handling
- Lua-specific `BrowserCommand` bridge

`BROWSERGENT_PAGE_LIBRARY` 不删除，而是迁移到 `ExtensionSession.loadLibrary()` 调用（Phase 2 adapter init 时加载）。如果 Browsergent 不再需要自定义 Lua 函数（`page.clear`、`page.extract` 等），则可以完全删除。

Browsergent 可以保留自己的 `BrowserCommand` 类型用于其他内部功能，但 Lua path 不应该再依赖它。

### Phase 6: update LLM tool prompt

LLM 仍然只应该看到一个 tool：

```text
run_lua
```

但是 Lua API 文档要改成 `extension-lua` 的真实语义。

关键点：

- 操作用户当前网页，使用 `tab.*`。
- 不要把 `page.*` 描述成目标网页 API。
- `page.*` 在 `extension-lua` 中代表 extension 自己页面环境，通常不用于 Browsergent 自动化目标页。
- 不要暴露 `tab.evaluate` 给 LLM。
- 所有 Lua 示例必须在安装后的 `@pi-oxide/extension-lua` 里实测通过。
- prompt 示例不能按记忆写，必须按 installed package 的 README / `.d.ts` / smoke test 对齐。

推荐示例（已通过源码验证 `crates/extension-lua/src/session.rs:39-106` 的 Lua library injection 确认存在）：

```lua
local tab_id = tab.current()
print(tab.url(tab_id))
print(tab.title(tab_id))
```

这些 convenience API 是 `ExtensionSession::new()` 通过 `load_library` 注入的 Lua alias，不是 `web.tab` 原生 API。它们在 `runCellAsync` 环境下自动可用。

如果未来版本移除了注入层，fallback 写法是：

```lua
local tabs = chrome.tabs.query({active = true, currentWindow = true})
local tab_id = tabs[1].id
print(tabs[1].url)
print(tabs[1].title)
```

```lua
local tab_id = tab.current()
local snapshot = tab.snapshot(tab_id)
print(snapshot)
```

还要明确告诉 LLM：

```text
tab.snapshot is the target-page snapshot.
page.snapshot is the side panel snapshot and is usually wrong for user browsing tasks.
```

如果当前 `tab.snapshot` 仍是简化 inline snapshot，而不是 `dom-semantic-tree`，prompt 需要承认这一点：它提供可交互元素和 `refId`，但语义质量弱于 `page.snapshot`。

**关键防御**：`page.snapshot` 在 extension-lua 中使用 `dom-semantic-tree`，质量反而比 `tab.snapshot` 更高，但它快照的是 side panel 自己。LLM 如果误用 `page.snapshot`，会拿到高质量但完全无关的快照。Browsergent 的 `runLua` adapter 应做静态扫描：如果代码包含 `page.snapshot` 但不包含 `tab.snapshot`，返回错误提示使用 `tab.snapshot`。

### Phase 7: clean pi-host-web wrapper

Browsergent 现在使用的是旧 raw wrapper 风格。升级到最新 SDK 形态后，应优先使用 package root SDK：

```ts
import { Agent, projectContext, toolResult } from "@pi-oxide/pi-host-web";
```

需要清理：

- 移除 `src/worker/wasm-bridge.ts` 中 debug trace logging。
- 移除 fake `page.extract` trace。
- 不再重复封装 SDK 已经提供的 drive loop。
- 确认 LLM text + tool blocks 不会产生 `null` content。
- 流式输出必须通过 SDK event 更新 UI，不能等整段 assistant message 结束后一次性替换。
- 大型 `tab.snapshot` / stdout 必须先做 context projection，再作为 tool result 返回给 LLM。
- message history 必须通过 SDK session state 持久化到 IndexedDB 或 Chrome storage。

## 必须注意的风险

### 1. extension-lua public API 当前假设主线程

`ExtensionSession.init()` 的 JS wrapper 当前会创建 Worker，并在主线程处理 `asyncRelay`。runner 依赖 `window.chrome`。

所以不要直接在 Browsergent Worker 里调用 `ExtensionSession.init()`，除非 `extension-lua` 新增 worker-native integration API。

### 2. content-script.js 依赖比预期窄

`extension-lua` 的命令路径分析（源码：`runner.ts`）：

| 操作 | 路径 | 需要 content script？ |
|------|------|---------------------|
| `tab.snapshot` | `executeInTab`（inline JS，MAIN world） | 不需要 |
| `tab.fetch` | `executeInTab`（inline JS，MAIN world） | 不需要 |
| `tab.evaluate` | `executeInTab`（inline JS，MAIN world） | 不需要（但 Browsergent 要禁止它） |
| `tab.click` | `sendMessageToTab` + auto-inject fallback（5 次 retry） | 有 fallback |
| `tab.fill` | `sendMessageToTab` + auto-inject fallback（5 次 retry） | 有 fallback |
| `tab.scroll_to` | `sendMessageToTab` + auto-inject fallback（5 次 retry） | 有 fallback |

`sendMessageToTab` 的 fallback 逻辑（`runner.ts:908-989`）：首次失败时自动 `chrome.scripting.executeScript({ files: ["content-script.js"] })`，等 300ms，然后重试最多 5 次。

**结论**：`content-script.js` 应该在 dist 里（fallback injection 引用这个文件名），但不是 build blocker。`tab.snapshot` 和 `tab.fetch` 完全不走 content script。如果 Browsergent 禁止了 `tab.evaluate`，唯一严格依赖 content script 的操作是 `tab.click` / `tab.fill`，而这些有 auto-inject fallback。

但 **`tab.click` / `tab.fill` 在快速导航场景下仍有 race condition**（retry 最多等 2.3s）。如果稳定性不够，需要 upstream 把 click/fill 也迁到 `executeInTab`。

### 3. 不要把 eval 能力暴露给 LLM

`extension-lua` 当前有 `tab.evaluate` 和 `tab.execute_script`（源码：`runner.ts` case `tab_evaluate` 和 `tab_execute_script`）。Browsergent 产品原则是 typed command protocol，不允许 arbitrary JS eval。

迁移时必须：

- system prompt 不提 `tab.evaluate`。
- Browsergent `runLua` adapter 在调用 `runCellAsync` 前做静态扫描：拒绝包含 `tab.evaluate`、`tab.execute_script`、`chrome.scripting.executeScript` 的代码。这比靠 prompt 保密可靠得多。
- 长期：upstream `extension-lua` 提供 `safeMode: true` 选项，在 runner 层禁用 evaluate。

### 4. 不要盲目扩大 manifest permissions

`extension-lua` 支持很多 Chrome API（cookies / history / bookmarks / downloads / notifications / alarms / clipboard），但 Browsergent 不一定需要。

不要因为 package 支持就加权限。Browsergent 第一阶段只需要：

- **tabs** — `tab.current()` / `tab.url()` / `tab.snapshot()` 底层都需要 `chrome.tabs.query` / `chrome.tabs.get` / `chrome.tabs.sendMessage`
- activeTab
- scripting — `executeInTab` 和 content script fallback 注入
- sidePanel — Browsergent side panel 自身
- storage — Browsergent 设置持久化

其他权限（clipboardRead / clipboardWrite / cookies / history 等）由产品需求驱动。

CSP 必须包含 `'wasm-unsafe-eval'`（extension-lua WASM 实例化需要）和 `connect-src *`（`tab.fetch` / `runtime.fetch` 需要）。

### 5. tab.* 和 page.* 语义必须讲清楚

Browsergent 旧 prompt 里 `page.*` 是目标网页 API。

`extension-lua` 新设计里，目标网页应该用 `tab.*`。

如果 prompt 没改，LLM 会继续写旧代码，导致工具失败或操作 side panel 自己。

### 6. extension-lua 实现验证清单

需要 reviewer 核对（基于代码审查结论）：

- `initExtensionListeners()` 在 `runner.ts` 模块加载时调用（line 1521），不在 `ExtensionSession.init()` 路径内。这意味着即使没创建 session，Chrome listeners 已经注册了。
- `tab.snapshot` 走 `executeInTab`（inline JS），**不**走 content script，也**不**走 `dom-semantic-tree`。质量低于 `page.snapshot`（后者走 `dom-semantic-tree`）。
- `content-script.js` 的 fallback injection 路径：`sendMessageToTab` → 首次失败 → `chrome.scripting.executeScript({ files: ["content-script.js"], world: "ISOLATED" })` → retry 5 次。
- `runCellAsync` result shape 已稳定为 `CellResult`（`stdout: string[]`, `stderr: string[]`, `result: string | null`, `error: WasmCellError | null`），不含 async 循环内部字段。

### 7. ExtensionSession 单例限制

`extension-lua` 的 runner 使用模块级 `AbortController`（`runner.ts` 顶层变量）。如果创建多个 `ExtensionSession`，第二个 session 的 `stopWith` 会覆盖第一个的 abort controller。

Browsergent 的 side panel adapter **必须是单例**。agent 和 standalone Lua tab 共享同一个 `ExtensionSession`，通过队列序列化访问。

### 8. run_lua 需要超时机制

`runCellAsync` 是一个在外部 Worker 里运行的 Promise。如果 Lua 代码 hang 住（如 `tab.wait_for_load` 在已加载页面上永远等待），无法被中断。

Relay 协议需要加超时（建议 30s）。超时后调用 `session.stopWith(runner)` 终止，然后重建 session。注意 `stopWith` 只有 50ms 宽限期（源码：`index.ts` 中的 `setTimeout(resolve, 50)`），之后强制 terminate Worker。

### 9. Standalone Lua tab 不能被遗漏

当前 Browsergent Worker 维护两个 `LuaRuntime`：一个给 agent `run_lua` tool，一个给 UI 的独立 Lua 标签页（`luaRun` 消息触发）。Phase 5 删除 `lua-runtime.ts` 后，独立 Lua tab 也会 break。

解决方案：Phase 2 的单例 adapter 同时服务两条路径，Phase 3 的 relay 同时处理 `luaRunRequest` 和 `luaRun` 消息。

## 验收测试

迁移完成后至少需要这些测试：

```text
Smoke test: tab.current() returns active tab id
Smoke test: tab.url(tab_id) returns current URL
Smoke test: tab.title(tab_id) returns current title
Smoke test: tab.snapshot(tab_id) includes visible page text
Smoke test: tab.fill/click works on a controlled test page
Smoke test: CellResult.stdout is string[] (join with "\n")
Smoke test: CellResult.error has WasmCellError shape (check kind field)
Agent mock LLM: run_lua -> tab.snapshot -> result returns to agent
Standalone Lua tab: luaRun message relay through same ExtensionSession
Security: code with tab.evaluate is rejected before runCellAsync
Security: code with page.snapshot (without tab.snapshot) returns warning
Timeout: long-running Lua cell is aborted after 30s
UI regression: new streamed message does not erase old chat history
UI regression: assistant deltas render incrementally
Build regression: du -sh dist/ is within acceptable budget
Build regression: manifest.json includes tabs permission and wasm-unsafe-eval CSP
```

Required commands:

```bash
npm run typecheck
npm run build
npx playwright test
```

If real-provider smoke test is available, run one minimal task:

```text
User: what page are we at?
Expected: agent calls run_lua once, Lua uses tab.url/title or tab.snapshot, answer includes actual page.
```

## Reviewer Checklist

- Browsergent no longer imports `@pi-oxide/piccolo-notebook-wasm`.
- Browsergent imports `@pi-oxide/extension-lua` only from side panel main-thread code, not from Browsergent Worker.
- `src/worker/lua-runtime.ts` is deleted or unused.
- AgentLoop depends on a thin `runLua(code)` callback relayed through side panel, not old Lua runtime internals.
- No Browsergent code maps `page_snapshot` / `page_click` / `page_url` action strings.
- Standalone Lua tab (UI Lua panel) routes through same `ExtensionSession` as agent.
- `ExtensionSession` is singleton — one per side panel, serialized access.
- `content-script.js` from `extension-lua` is present in built extension output (non-blocking but recommended).
- LLM prompt documents `tab.*` as the target-page API, warns about `page.snapshot` capturing side panel.
- LLM prompt does not expose arbitrary JS evaluate; adapter does runtime static scan.
- `runLua` adapter handles `CellResult` correctly: `stdout: string[]` (join), `error: WasmCellError` (check kind).
- `manifest.json` includes `tabs` permission and `'wasm-unsafe-eval'` CSP directive.
- `runLua` relay has timeout mechanism (30s), calls `stopWith` on timeout.
- Existing pi-host-web integration remains typed and does not include fake traces.
- Full typecheck, build, and Playwright suite pass.

## 外部 Reviewer 意见 (pi-host-web SDK v2 maintainer)

刚发布 `@pi-oxide/pi-host-web@0.2.0`，看过这份计划后，LLM / prompt 部分方向是对的，但有几处值得补到 Phase 6 或 Phase 7：

### 1. Streaming 必须在 prompt 阶段就考虑

Phase 6 只关心 prompt 文案，但 LLM 输出是流式的。`pi-host-web` SDK v2 的 `Agent.run()` 会逐 chunk 把 `text_delta` 喂进 `feedLlmChunk`。当 LLM 在流中输出一个 `tool_use` block 时，SDK 会 emit `message_end` 再切到 `tool_execution_start`。Browsergent 的 UI 必须能在这两种 event 之间不闪屏、不丢历史。建议在 Phase 6 加一条：prompt 长度不应影响 streaming 的 chunking 行为，因为 `projectContext()` 会在传入 LLM 前做预算裁剪。

### 2. `tab.snapshot()` 的结果必须过 context projection

Phase 6 的 prompt 示例里有 `tab.snapshot(tab_id)`。snapshot 可能返回很大的 DOM 文本。`pi-host-web` 已经 export `projectContext()`，可以按 token 预算做 `keep-full / head / tail / head-tail` 裁剪。Browsergent 应该在 `run_lua` tool handler 里拿到 `runCellAsync` 结果后，先投影再传给 `toolResult()`，否则大 snapshot 会撑爆 LLM context window。

### 3. `runCellAsync` result shape 要直接兼容 SDK `toolResult()`

`pi-host-web@0.2.0` 的 `toolResult(text)` 返回 `{ content: [{ type: "text", text }] }`。如果 `extension-lua` 的 `runCellAsync` 返回的是 `{ output, error, done }` 之类，Browsergent wrapper 需要做一次轻量转换，而不是把 raw Lua cell result 直接丢给 agent。Phase 4 的 `RunLua = (code) => Promise<LuaToolResult>` 应该明确这层转换。

### 4. `tab.evaluate` 不应该只在 prompt 里隐藏

Risk 3 说得对，但建议更激进：prompt 不提 evaluate 是必要不充分条件。LLM 可能从 `extension-lua` 的 error message 或其他渠道猜到 evaluate 存在。最可靠的做法是上游 `extension-lua` 提供 `safeMode: true` 选项，在 runner 层就把 `tab.evaluate` 和 `page.evaluate` 注册为空函数或 throw。这比"靠 prompt 保密"安全得多。

### 5. Session persistence 应该跨 pi-host-web + extension-lua

计划里没有提 session 持久化。`pi-host-web` 有 `getSessionState()` / `setSessionState()` 可以把 agent message history 存到 IndexedDB。但 Lua 的 `ExtensionSession` 也有自己的 cell state。建议验收测试里加一条：side panel 关闭再打开后，agent 能恢复上一次的 message history，并且新的 `run_lua` call 仍然能在同一个 Chrome tab 上下文继续工作（或优雅地重新绑定当前 tab）。

### 6. 单工具架构没问题，但留好扩展位

Phase 6 说 LLM 只应该看到 `run_lua`。这在 Browsergent v1 是对的。但 `pi-host-web` SDK 支持任意 tool map，将来如果加 `take_screenshot` 或 `run_javascript` 不需要改 agent 核心。建议 Phase 4 的 `RunLua` callback 放在更大的 `tools: Record<string, handler>` 对象里传给 `Agent.run()`，而不是硬编码成单工具 special case。

**总结**：prompt 的 `tab.*` 语义切换是这份计划里最重要也最容易踩坑的地方，必须和 `extension-lua` 的 actual API 一字不差地对齐。其余的是把 SDK v2 已经有的能力（streaming、projection、session state、多工具 map）接进来，不要做重复封装。

---

## Reviewer 意见 (extension-lua / web-lua / dom-semantic-tree 实现者)

刚完成 `@pi-oxide/extension-lua@0.1.0`、`@pi-oxide/web-lua@0.1.0`、`@pi-oxide/dom-semantic-tree@0.1.0` 的发布和 Playwright 测试修复。以下是对这份迁移计划的实际代码层 review。

### 1. 计划架构方向正确，但 Worker 层数值得再议

计划推荐：
```
Browsergent Worker -> Side Panel Main Thread -> ExtensionSession (internal Worker)
```

这是三层。`ExtensionSession.init()` 内部确实会创建自己的 Worker 来处理 async 命令循环和 Chrome API relay。如果 Browsergent 的 AgentLoop 也放在 Worker 里，每次 `run_lua` 都要跨两个 Worker 边界。

**建议**：考虑直接把 AgentLoop 搬到 Side Panel main thread。理由：
- LLM 网络调用本来就是 async，不会阻塞 UI。
- `ExtensionSession.runCellAsync()` 返回 Promise，await 它不会阻塞主线程。
- 少一层 Worker 意味着少一层序列化/反序列化，延迟更低，错误栈更短。
- 如果坚持 Worker，建议在 worker→sidepanel 协议里支持 `luaRunProgress`（流式 stdout），否则长-running Lua cell 会让 AgentLoop 完全黑箱。

### 2. `tab.snapshot` 实际上**没有**使用 `dom-semantic-tree` —— 这是最大质量 gap

Risk #6 问 `tab.snapshot` 是否走 content-script / dom-semantic-tree。**答案是 NO。**

当前实现：
- `web-lua` 的 `page.snapshot` 使用 `dom-semantic-tree`（`collectDocument` + `formatSnapshot`），产出高质量语义树（含 heading 层级、form label、link context 等）。
- `extension-lua` 的 `page.snapshot` 同样使用 `dom-semantic-tree`。
- **`extension-lua` 的 `tab.snapshot` 使用 `executeInTab` + 手写的 `inlineSnapshot` 函数**：
  - 只是 `document.body.querySelectorAll("*")`
  - 基础 role 映射（button/link/textbox/checkbox/radio/img/heading/generic）
  - 没有 heading 层级、没有 label 关联、没有 table 语义、没有 link target
  - 截断到 `max_nodes` 时只是按 DOM 顺序截断，没有语义优先级

**影响**：Browsergent 自动化目标页时，拿到的 `tab.snapshot` 质量远低于 `page.snapshot`。

**建议**：
- 短期：在 LLM prompt 里明确说明 `tab.snapshot` 是简化格式，可能需要配合 `tab.fill`/`tab.click` 的 `refId` 使用。
- 中期：upstream `extension-lua` 应该把 `dom-semantic-tree` WASM 注入目标 tab（通过 `executeInTab` 传递 base64 WASM 或把 snapshot 逻辑编译为纯 JS bundle）。这是个非 trivial 工作项，需要单独计划。
- **最讽刺的陷阱**：`page.snapshot` 在 extension-lua 里反而质量更高，但它快照的是 side panel 自己。如果 LLM prompt 没讲清楚 `tab.*` vs `page.*`，LLM 可能用 `page.snapshot` 以为在拍目标页，结果拿到一个高质量但完全错误的快照。

### 3. Phase 6 的 prompt 示例 API 存在性（修正）

**此前声称 `tab.current()` / `tab.url()` / `tab.title()` 不存在，这是错误的。**

`ExtensionSession::new()`（`crates/extension-lua/src/session.rs:33-106`）在构造时会通过 `load_library` 注入一层 Lua alias library，其中定义了：

- `tab.current()` → `chrome.tabs.query({active=true, currentWindow=true})`，返回 `tabs[1].id`
- `tab.url(tab_id?)` → `chrome.tabs.get(id)`，返回 `.url`（不传参时默认当前 tab）
- `tab.title(tab_id?)` → `chrome.tabs.get(id)`，返回 `.title`（不传参时默认当前 tab）
- `tab.open(url)` → `chrome.tabs.create({url=...})`，返回新 tab id
- `tab.focus(tab_id?)` → `chrome.tabs.update(id, {active=true})`
- `tab.reload(tab_id?)` → `chrome.tabs.reload(id)`
- `page.fetch(url, opts)` → `tab.fetch(tab.current(), url, opts)`

所以计划 Phase 6 的示例代码：
```lua
local tab_id = tab.current()
print(tab.url(tab_id))
print(tab.title(tab_id))
```
**实际上是正确的**，只要通过 `ExtensionSession` 运行（而不是直接看 `web.rs` 的注册表）。

**但要注意注入 layer 的边界**：
- `web.tab.fetch` 的底层签名是 `(url, opts)`，但注入后的 `tab.fetch` 变成了 `(tab_id, url, opts)`。
- 注入的 `tab` 表同时 alias 了 `web.tab.*` 的所有 API，并额外补充了 convenience 函数。
- 如果 Browsergent 绕过 `ExtensionSession` 直接调用底层 WASM API（如 `load_library` 后手动执行），这些 convenience 函数不会自动出现。

**结论**：prompt 示例没问题，但文档必须明确说明这些 convenience API 是 `ExtensionSession` 注入的，不是 `web.tab` 原生提供的。

### 4. `content-script.js` 的依赖比计划想象的要窄

计划强调 `content-script.js` 必须进 dist。实际上：
- `tab.snapshot` 和 `tab.fetch` 已改用 `executeInTab`（inline JS 注入），**不需要** content script。
- `tab.click`、`tab.fill`、`tab.scroll_to` 等仍用 `sendMessageToTab`，但该函数自带 retry fallback：如果 content script 不存在，会自动执行 `chrome.scripting.executeScript({ files: ["content-script.js"] })` 并重试 5 次。
- **唯一严格依赖 content script 的是 `tab.evaluate`**。

推论：如果 Browsergent 成功把 `tab.evaluate` 从 LLM 可见面移除，那么 `content-script.js` 的 criticality 大幅下降。但它仍然需要在 dist 里，因为 fallback injection 会引用它。

### 5. `tab.click` / `tab.fill` 仍然有 content-script race condition

虽然 `sendMessageToTab` 有 retry fallback，但 Playwright 测试表明：在全新 tab 或快速导航场景下，`tab.click` 和 `tab.fill` 仍可能遇到 "Receiving end does not exist" 延迟（即使有 retry，最多等 2.3 秒）。

`tab.snapshot` 和 `tab.fetch` 之前因此改为 `executeInTab`。**建议 upstream 也把 `tab.click`、`tab.fill` 迁到 `executeInTab`**，注入 inline click/fill 函数，彻底消除对 content script 的 runtime 依赖。这是 Browsergent 稳定性验收的一个 blocker。

### 6. Bundle size 会暴涨，需要预算

实际包大小（npm tarball）：
- `@pi-oxide/extension-lua`: ~1.9 MB gzipped, ~7.1 MB unpacked
- `@pi-oxide/web-lua`: ~2.3 MB gzipped, ~8.3 MB unpacked
- `@pi-oxide/dom-semantic-tree`: ~347 KB gzipped, ~1.1 MB unpacked

Chrome Web Store 对扩展包大小有 soft limit（虽然硬性上限是 2GB，但超过几 MB 会有性能警告）。Browsergent 引入 `extension-lua` 后，如果本身已经有 `pi-host-web` 和其他依赖，需要做一次 bundle audit，确保 Vite build 没有把 `web-lua` 也意外打包进去（如果 Browsergent 只在 extension 上下文用 `extension-lua`，就不应该同时包含 `web-lua`）。

### 7. `CellResult` 形状已稳定（修正：实际类型与此前描述不同）

刚完成的 refactor 把 ABI 类型清理为 `CellResult`（源码：`crates/web-lua-base/src/types.rs`，通过 `tsify` 生成 TS 类型）：
```ts
interface CellResult {
  stdout: string[];              // 数组，每行一个元素
  stderr: string[];              // 数组
  result: string | null;         // JSON 序列化的 Lua 返回值
  error: WasmCellError | null;   // discriminated union，不是 string
  execution_count: number;
}

type WasmCellError =
  | { kind: "compile"; message: string; line: number | null }
  | { kind: "runtime"; message: string }
  | { kind: "strict_mode"; variable: string }
  | { kind: "fuel_exhausted" }
  | { kind: "internal"; message: string };
```

没有 `commands`、`pending_command`、`fuel_exhausted`（作为 top-level 字段）、`status: "async_pending"` 等内部字段。这对 Browsergent 是利好 —— 不需要理解 async 循环状态机。

Browsergent 的 `RunLua` wrapper 应该：
- `cell.stdout.join("\n")` 拼接输出，不是直接 `cell.stdout`。
- `cell.error` 按 `kind` 分支处理：`compile` 带行号、`fuel_exhausted` 提示死循环、`runtime` 可能是 refId 过期。
- 有 error 时把 `[kind] message + "\n" + stderr.join("\n")` 传给 `toolResult`，而不是把 raw `CellResult` 对象 stringify 丢进去。

### 8. `ExtensionSession` lifecycle 计划里缺了 `stopWith`

计划 Phase 2 的 adapter 要提供 reset / stop，但没提 `stopWith` 的语义。`ExtensionSession.stopWith(runnerPromise)` 接受一个 Promise，会 abort signal 内部 runner，等待 runner 结束后再 resolve。side panel 关闭或扩展 unload 时**必须**调用它，否则内部 Worker 会变成 zombie。

建议 adapter 暴露：
```ts
async dispose(): Promise<void> {
  await session.stopWith(currentRunner);
}
```

### 9. `tab.evaluate` 的防御不能仅靠 prompt

外部 reviewer 也提了这点。我再补一个实现层细节：`extension-lua` 的 runner.ts 里 `tab.evaluate` 和 `tab.execute_script` 都已经是注册好的 case。如果只靠 prompt 隐藏，LLM 一旦猜对名字就能执行任意 JS。

**更可行的短期方案**：Browsergent 的 adapter 在把 code 传给 `runCellAsync` 之前，做一次静态扫描（简单的 string search）：如果 code 里出现 `tab.evaluate`、`tab.execute_script`、`chrome.scripting.executeScript`，直接拒绝并返回错误。这比 prompt 工程可靠 10 倍。

### 10. `tab.wait_for_load` 的行为边界

`tab.wait_for_load(tab_id)` 在当前实现里会注册 `chrome.tabs.onUpdated` 监听，等 `status === "complete"`。但如果目标 tab 已经 complete，它会永远等下去（因为事件不会再发）。这是一个已知 edge case，Browsergent 的 prompt 不应鼓励在"可能已经加载完"的 tab 上调用它。更安全的模式是调用前先 `tab.snapshot` 判断页面状态。

---

**总结**：这份计划的 Phase 1–5 架构边界切得干净。Phase 6 的 prompt 文案中 `tab.current()` / `tab.url()` / `tab.title()` 等 convenience API 确实存在于 `ExtensionSession` 的注入层（经核实 `session.rs:39-106`），示例代码可以工作。当前最大的真实风险点是：
1. `tab.snapshot` 使用的是简化 inline snapshot，质量远低于 `page.snapshot`（后者走 `dom-semantic-tree`），必须在 prompt 里向 LLM 明确说明这一差距，并在 adapter 层做 `page.snapshot` 误用检测。
2. `tab.click` / `tab.fill` 仍依赖 `sendMessageToTab` + content script，在快速导航场景下仍有 race condition 风险，建议 upstream 迁到 `executeInTab`。
3. `tab.evaluate` 不能仅靠 prompt 隐藏，需要运行时静态扫描防御。
4. `CellResult` 类型必须用正确形状：`stdout: string[]`（不是 `string`），`error: WasmCellError | null`（不是 `string | null`）。
5. `ExtensionSession` 必须单例使用（模块级 AbortController 限制）。
6. Standalone Lua tab 必须和 agent 共享同一个 `ExtensionSession`，不能各建各的。

建议先把 Phase 6 的所有 Lua 示例在 `extension-lua@0.1.0` 上实测一遍，确认 `tab.snapshot` 的 output 质量是否可被 LLM 有效利用，再进入 Phase 2–5 的代码迁移。
