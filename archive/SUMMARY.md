# Browsergent — 当前状态与方向

## 我们在造什么

Browsergent 是一个 Chrome MV3 侧边栏扩展。用户输入任务，agent 控制浏览器完成。

## 两个界面

1. **Chat**（主界面）— 用户输入自然语言任务，agent 执行
2. **Lua Playbook**（必需）— 用户直接写 Lua 脚本控制浏览器

两个界面共享同一条路径：Lua `page.*` API → yield BrowserCommand → content script 执行。

## 正确的分工

```
用户说 "填表提交"
  → LLM (reasoning) 理解意图，生成 Lua 代码
  → run_lua(lua_code)  ← LLM 唯一的浏览器工具
  → Worker 里 LuaRuntime 执行 Lua
  → Lua 调用 page.snapshot() / page.fill() / page.click()
  → 每个 page.* 调用 yield 一个 BrowserCommand
  → BrowserCommand 发到 background → content script
  → content script 执行 DOM 操作，返回结果
  → 结果 resume 回 Lua
  → Lua 执行完毕，结果返回给 LLM
  → LLM 继续推理或完成任务
```

**核心原则：LLM 负责 reasoning，Lua 负责 acting。**

- LLM 唯一的浏览器工具是 `run_lua`
- `page.*` 是 Lua 的 API，不是 LLM 的直接工具
- 同样的 `page.*` API，agent 和用户手写 playbook 都用

## 当前代码的问题

### 问题 1：LLM 被给了 12 个直接工具

现在 `anthropic.ts` 定义了 `page_snapshot`, `page_click`, `page_fill` 等 12 个工具直接给 LLM。

**应该**：LLM 只有一个工具 `run_lua`，所有浏览器操作通过 Lua 代码完成。

### 问题 2：Agent 和 Lua 都跑在 UI 线程

`app.tsx` 直接 `new AgentLoop()` 和 `new LuaRuntime()` 在 Preact 回调里执行。

**应该**：两者都跑在 Web Worker 里。app.tsx 通过 `postMessage` 与 Worker 通信。Worker 里已有完整 handler 代码但是死代码。

### 问题 3：Agent loop 不经过 Lua

现在 agent loop 直接把 Anthropic tool call 映射成 BrowserCommand 发出去。绕过了 Lua 层。

**应该**：agent loop 收到 `run_lua` tool call → 丢给 LuaRuntime → Lua yield BrowserCommand → 执行 → 结果回 Lua → 回 agent。

## 目标架构

```
Side Panel (Preact)
  │ postMessage
  ▼
Web Worker
  ├── AgentLoop
  │     ├── pi-core WASM (状态机)
  │     ├── Anthropic API 调用
  │     └── 唯一工具: run_lua
  │           │
  │           ▼
  ├── LuaRuntime
  │     ├── piccolo WASM
  │     ├── page.* API → yield BrowserCommand
  │     └── BrowserCommand → chrome.runtime.sendMessage
  │
  ▼
Background Service Worker (只做路由)
  │ chrome.tabs.sendMessage
  ▼
Content Script (在目标 tab)
  ├── DOM snapshot (ref_id)
  └── 执行 BrowserCommand
```

## 每一层干什么

| 层 | 职责 | 不干什么 |
|---|---|---|
| LLM | 理解用户意图，生成 Lua 代码 | 不直接操作浏览器 |
| Lua | 调用 page.* API，控制浏览器 | 不碰 DOM、不碰 chrome API |
| Worker | 跑 WASM，路由 BrowserCommand | 不渲染 UI |
| Background | 注入 content script，转发消息 | 不执行任何操作 |
| Content Script | 执行 DOM 操作 | 不做决策，不 eval JS |
| UI | 显示 chat、trace、状态 | 不跑任何 runtime |

## LLM 的工具定义（唯一的浏览器工具）

```json
{
  "name": "run_lua",
  "description": "Execute Lua code to control the browser. Available API:\n- page.snapshot() → returns page elements with ref_ids\n- page.click(ref_id) → click element\n- page.fill(ref_id, text) → fill input\n- page.clear(ref_id) → clear input\n- page.select(ref_id, value) → select option\n- page.press(key) → press key\n- page.scroll(direction, amount?) → scroll\n- page.extract(ref_id?) → extract text\n- page.goto(url) → navigate\n- page.back() / page.forward() / page.reload()",
  "input_schema": {
    "type": "object",
    "properties": {
      "code": { "type": "string", "description": "Lua code" }
    },
    "required": ["code"]
  }
}
```

## Agent loop 的流程

```
1. 用户输入任务
2. Worker 创建 AgentLoop
3. AgentLoop 调 Anthropic API，传 system prompt + 用户消息 + run_lua 工具定义
4. Anthropic 返回 tool_use: { name: "run_lua", arguments: { code: "..." } }
5. AgentLoop 把 Lua 代码丢给 LuaRuntime.run()
6. LuaRuntime 执行：
   a. run_cell(code) → 可能 yield page.snapshot
   b. Worker 把 BrowserCommand 发到 background → content script
   c. 结果 resume 回 Lua
   d. 重复直到 Lua 执行完毕
7. Lua 结果返回给 AgentLoop
8. AgentLoop 调 pi-core on_tool_done（或直接构建下一轮消息）
9. AgentLoop 再次调 Anthropic，带上工具结果
10. 重复直到 Anthropic 返回 end_turn
```

## Lua playbook 直接执行

用户在 Lua tab 写代码，点 Run：

```
1. app.tsx postMessage({ type: "luaRun", code }) 给 Worker
2. Worker 里 LuaRuntime.run(code, callbacks)
3. 同样的 yield/resume 循环
4. 结果通过 postMessage 回 UI
```

跟 agent 调 run_lua 走的是**完全一样的路径**，只是触发源不同。

## 需要改什么

| 改动 | 描述 |
|------|------|
| Worker 独立构建 | 让 Vite 输出独立的 worker.js |
| UI 接 Worker | app.tsx 改成 postMessage，不再直接调 runtime |
| 合并工具 | anthropic.ts 删掉 12 个工具，换成 1 个 run_lua |
| Agent 依赖 Lua | agent-loop 收到 run_lua → 调 LuaRuntime，不再直接映射 BrowserCommand |
| 删掉死代码 | mapToolToCommand 等 |
| 清理 | 无 any, 无 Object, 无 console.log |

## 不改什么

- content script — 已经正确
- background — 已经正确
- message types — 已经定义好
- BrowserCommand 类型 — 不变
- Worker handler 代码 — 已经写好，只需接通
