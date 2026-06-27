# Browsergent TODO

> §1–§11、§13–§14 已全部落地。

## Candidate features (investigated — not started)

| § | Feature | Verdict | Work location |
|---|---------|---------|---------------|
| 12 | Right-click page element → reference it in chat | ✅ Feasible — 必须捕获 **durable locator**，而非原始 refId（refIds 受租约限制） | Browsergent content-script overlay + 新 `@[element:…]` mention |
| 15 | Snapshot: full HTML + richer table/list view | ⚠️ Partial — table/list/item **角色已存在**；gap 在于平面展示 + 无 HTML 导出。需改 trace 数据模型（`AgentTraceEntry.result` 仅存扁平字符串，上游 `SemanticNode` 无 parent/children/depth），属 hardcore | Presentation = Browsergent; HTML export = upstream `web-js` |
| 16 | Lightweight PDF API | ✅ Feasible — agent 无法读取 PDF 内容 | upstream `web-js` + Browsergent `file_read` |
| 17 | Per-domain site skill registry | ✅ Feasible — 通过 `SkillMeta.domains` 按域名过滤/自动激活 | Browsergent skills layer |
| 19 | URL 匹配自动激活技能 + 通用触发源 | ✅ 可行 — pi-core 零改动（已触发源无关）；SDK 加 `TriggerSource` 类型；Browsergent 加 frontmatter `match` 字段 + `webNavigation` URL 跟踪 + steer 分发 | pi-oxide SDK + Browsergent skills/navigation 层 |

### 12. 右键页面元素 → 在聊天中引用

**可行性结论：** ✅ 可行 — 但不能直接抓 refId，必须抓「持久锚点」。详情见 2026-06-20 分析（refIds 是 lease-bound；需构造 role+name+selector+text 的持久锚点，agent 在 Run 时用 `page.snapshot_data()` 重新解析）。

**未实现：** 内容脚本 `element-context.ts`、`resolve-element-mentions.ts`、contextMenus 接线 — 均不存在。

### 15. Snapshot improvements

**(a) Presentation — Browsergent 侧：** `SnapshotView.tsx` 不存在。需要从 JSON 重建层级树并渲染可折叠视图。
**(b) Full HTML — upstream：** `page.html()` 在 `web-js` 中不存在。

### 16. PDF API

**未启动。** 需要评估 PDF 文本提取库并添加 `page.pdf()` 或 `file_read({ format: "pdf-text" })`。

### 17. Per-domain site skills

**未启动。** 需要添加 `SkillMeta.domains` 字段、域名过滤、自动激活触发、域名徽章 UI。

### 18. Cross-origin iframe 交互（多帧 snapshot + 跨帧 action）

**可行性结论：** ✅ 可行 — 采用**显式 `frameId` 字段方案**（非 refId 编码前缀）。Chrome 扩展特权绕过同源策略：`host_permissions: ["<all_urls>"]` + `all_frames: true` 让 content script 注入跨域 iframe 并访问其 DOM。

**架构：**

1. **权限层** — `manifest.json` 增加 `webNavigation` + `scripting` permissions；`host_permissions: ["<all_urls>"]`；content_scripts 设 `"all_frames": true, "run_at": "document_idle"`。
2. **类型层（显式方案）** — `ElementSnapshot` 增加 `frameId: number` 字段；`BrowserCommand` 中所有 refId 变体增加 `frameId: number` 字段；`PageSnapshot` 携带 frame 元数据（`{ frameId, url, parentFrameId }[]`）。类型链显式、可读，frame 定位不依赖字符串解析。
3. **Frame 枚举** — Background 调用 `chrome.webNavigation.getAllFrames({ tabId })` → 过滤可达 frame（`/^https?:/.test(url)` 且非 `chrome-extension://`/`chrome://`）→ 跳过 sandboxed（无 `allow-same-origin`）和非 HTML content type。
4. **Snapshot 合并** — 对每个可达 frame 并行 `chrome.tabs.sendMessage(tabId, snapshotCmd, { frameId })` → 每个 frame 的 content script 独立执行 `collect_document`（逻辑不变）→ background 给每个 `ElementSnapshot` 标注 `frameId` → 合并成统一 `PageSnapshot`。
5. **Action 路由** — `BrowserCommand` 携带 `frameId` → background 用 `chrome.tabs.sendMessage(tabId, cmd, { frameId })` 路由到对应 frame 的 content script → 该 frame 内按 `refId` 解析元素执行 click/fill/select。非 refId 命令（`page.goto`/`page.scroll`/`page.url`）路由到顶层 frame（`frameId: 0`）。
6. **Prompt 更新** — `js-tool-prompt.ts` 在 snapshot 文本中标注 frame 边界（`--- Frame N (url) ---`），让 agent 理解 `frameId` 语义。

**不能解决：**
- `sandbox` 且无 `allow-same-origin` 的 iframe — opaque origin，Chrome 不允许 content script 注入，浏览器硬限制。
- `chrome://` / `chrome-extension://` frame — 受 AGENTS.md 不变量约束拒绝。

**边界情况：**
- Frame 延迟加载 → snapshot 前等待 `chrome.webNavigation.onCompleted`，或支持 agent 主动重新 snapshot。
- Frame 内导航 → 监听 `onCommitted` 更新 frame 映射；action 后重新 snapshot。
- 嵌套 iframe → `all_frames: true` 自动递归注入所有层级；snapshot 标注嵌套深度。
- 1×1 隐形广告 iframe → 过滤 `width<=1 || height<=1`。

**改动文件：** `manifest.json` + `src/background/index.ts`（frame 枚举/合并/路由）+ `src/types/browser.ts`（`ElementSnapshot`/`BrowserCommand` 加 `frameId`）+ `src/sidepanel/extension-js-client.ts`（per-frame 消息分发）+ `src/worker/js-tool-prompt.ts`（frame 边界标注）+ content script（基本不改，已 per-frame 独立运行，只是之前只收集顶层）。

**未启动。** 等待确认后实现。

### 19. URL 匹配自动激活技能 + 通用触发源

**设计文档：** `docs/design-url-triggered-skills.md`

**目标：** 当 agent 活动标签页导航到匹配技能 `match` 模式的 URL 时，自动激活该技能 — 无需用户操作。同时将 Browsergent 的触发模型从「仅用户输入」泛化到导航事件等非用户触发源。

**可行性结论：** ✅ 可行 — pi-core **零改动**。`start_turn` 接受任意 `AgentMessage`，`hostSteer` 可运行中注入消息 — 核心已触发源无关。改动集中在 SDK 层和 Browsergent 层。

**架构：**

1. **pi-oxide SDK 层** — 新增 `TriggerSource` 类型（`user` / `navigation` / `system`），`Agent.steer()` 接受该类型，emit `trigger` 事件让 UI 区分用户消息与系统触发。底层仍构造 `AgentMessage::user()` — 核心无感知。
2. **Frontmatter `match` 字段** — `parse-skill-md.ts` + `skill-types.ts` 加 `match?: string`（glob 模式，如 `linkedin.com/jobs/search*`，对完整 URL 大小写不敏感匹配）。`format-skill-catalog.ts` 在 XML 中加 `<match>` 元素。
3. **URL 跟踪** — Side panel 用 `chrome.webNavigation.onCommitted`（manifest 已有权限）监听顶层导航，`UrlTracker` 去重存储当前 URL。过滤 `chrome://` / `chrome-extension://`。
4. **匹配分发** — URL 变化时 `matchSkillsToUrl(skills, url)` 匹配所有技能：
   - **Agent 运行中**：post `skillAutoActivate` 到 worker → `agentLoop.steerSkill()` → `agent.steer("<navigation_trigger url=…><skill>…</skill></navigation_trigger>")` 注入技能内容。
   - **Agent 空闲**：加入 `pendingAutoSkills` 集合 → 下次 `agentStart` 时合并进 `activatedSkills`，烘焙进系统提示词。
5. **系统提示词** — `anthropic-prompts.ts` 说明导航触发语义，让 LLM 理解 `<navigation_trigger>` XML。

**新消息类型：** `PanelToWorker` 加 `urlChanged` + `skillAutoActivate`；`WorkerToPanel` 加 `skillAutoActivated`（可选 UI 反馈）。

**不做什么：**
- 不自动启动 agent turn — 空闲时仅预加载技能，启动 turn 仍需用户操作（避免意外 agent 运行）。
- 不改 pi-core — 触发源是 host 编排关注点，不是核心类型关注点。
- 不加新 `AgentMessage` 变体 — 导航触发用 `User` 消息 + XML 内容包装。
- 不支持正则匹配 — glob 足够，更简单更安全。
- 不支持 `match: [...]` 数组 — 单字符串，需要时再加。

**边界情况：**
- 多技能匹配同一 URL → 全部激活，按名称排序，目录预算超限时截断（同现状）。
- URL 快速变化（重定向）→ `UrlTracker` 同 URL 去重；steer 消息排队由现有 `hostSteer` 机制处理。
- Side panel 关闭 → 无监听器；重新打开时 `chrome.tabs.query` 初始化当前 URL 并触发一次匹配检查。
- `page.goto` 到 `chrome://` → 被 `page_goto` handler 和 `webNavigation` 监听器双重拒绝。

**改动文件：**
- **pi-oxide**: `pi-host-web/sdk/types.ts`（`TriggerSource`）+ `pi-host-web/sdk/agent.ts`（`steer()` 扩展）+ `pi-host-web/sdk/orchestration/agent-engine.ts`（`steerAgent` 扩展）
- **Browsergent**: `src/skills/parse-skill-md.ts` + `skill-types.ts` + `validate-skill-meta.ts` + `format-skill-catalog.ts`（`match` 字段）+ `src/skills/url-match.ts`（新，匹配函数）+ `src/sidepanel/url-tracker.ts`（新，URL 状态）+ `src/types/messages.ts`（新消息类型）+ `src/worker/agent-loop.ts`（`steerSkill`）+ `src/worker/index.ts`（消息分发）+ `src/sidepanel/app.tsx`（接线）+ `src/worker/anthropic-prompts.ts`（提示词）

**实现顺序：** url-match + tests → frontmatter 字段 → catalog XML → UrlTracker + webNavigation → 消息类型 → worker steerSkill → side panel 接线 → 系统提示词 → SDK TriggerSource（可选，可后加）。

**未启动。** 等待确认后实现。

---

## 已完成

| § | 功能 | 状态 |
|---|------|------|
| 1 | JS 代码块 UI 渲染 | ✅ 完成 |
| 2 | 移除 JS tab → Files 面板（文件树 + 预览 + 上传） | ✅ 完成 |
| 3 | `@` 命令 — 引用文件 | ✅ 完成 |
| 4 | 合并到 §6 Layer 1 | — |
| 5 | Agent 空闲时重新聚焦输入框 | ✅ 完成 |
| 6 | Agent Skills 系统（Layers 1/2a/2b/2c + Phase D 用户技能） | ✅ 完成 |
| 7 | Shift+Enter 多行输入 | ✅ 完成 |
| 8 | 直接文件工具（`file_list`/`read`/`edit`/`delete`/`write`） | ✅ 完成 |
| 9 | 聊天拖放文件 → 上传 + 自动附加 | ✅ 完成 |
| 10 | `run_js` 支持文件引用参数 | ✅ 完成 |
| 11 | 统一 OPFS 文件系统（无 session 作用域、无 .index.json、无 IndexedDB） | ✅ 完成 |
| 13 | 真实文件管理器（创建/删除/重命名/移动文件夹和文件） | ✅ 完成 |
| 14 | `@` 引用打开标签页 | ✅ 完成 |
