# Browsergent TODO

> **所有优先级任务（5 项）均已落地。** 以下 §1–§11 均已完成，§13–§14 也已实现。

## 已完成 — 无需再动

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

---

## Candidate features (investigated — not started)

| § | Feature | Verdict | Work location |
|---|---------|---------|---------------|
| 12 | Right-click page element → reference it in chat | ✅ Feasible — 必须捕获 **durable locator**，而非原始 refId（refIds 受租约限制） | Browsergent content-script overlay + 新 `@[element:…]` mention |
| 15 | Snapshot: full HTML + richer table/list view | ⚠️ Partial — table/list/item **角色已存在**；gap 在于平面展示 + 无 HTML 导出。需改 trace 数据模型（`AgentTraceEntry.result` 仅存扁平字符串，上游 `SemanticNode` 无 parent/children/depth），属 hardcore | Presentation = Browsergent; HTML export = upstream `web-js` |
| 16 | Lightweight PDF API | ✅ Feasible — agent 无法读取 PDF 内容 | upstream `web-js` + Browsergent `file_read` |
| 17 | Per-domain site skill registry | ✅ Feasible — 通过 `SkillMeta.domains` 按域名过滤/自动激活 | Browsergent skills layer |

---

## 已知 bug

- [ ] **`@` picker 在上传文件后未刷新** — 通过输入栏拖放或 Files 面板的上传按钮上传文件后，`@` 列表仍显示陈旧的文件名，直到侧栏重新加载。原因：`use-picker.ts` 中的 `filePickerItems` memo 依赖 `filesState.nodes`，但文件上传未触发 `filesVersion` 变更（selectors 依赖链未更新导致 Preact 未重渲染）。

---

## 旧章节（留作参考，已完成）

### 1. JS code block UI

**已核实：** `TraceEntryCompact.tsx` 已正确渲染 `run_js` 代码块（解析 JSON 提取 `code` 字段，`font-mono` 代码块，显示状态 spinner，折叠预览显示代码首行）。所有复选框均已勾选并验证。

### 2. Remove JS tab → Files panel (file tree + preview + upload)

**已核实：** `UiTab = "chat" | "files"`（无 "js"）。`FilesPanel.tsx` 存在于 `components/files/` 下。`InputBar.tsx` 存在于 `components/input/` 下。已完成文件树（`FileTree.tsx`）、预览（`FilePreview.tsx`）、上传功能。`session-panel.tsx` 中的会话持久化也已实现。

### 3. `@` command — reference files in the task input

**已核实：** `resolve-file-mentions.ts` 已完整实现。`InputBar.tsx` 中的 `usePicker`（`use-picker.ts`）处理 `@` 检测、文件列表展示、插入 token。`detect-mention-state.ts` 中的 `filesToPickerItems`/`buildPickerInsert`/`resolvePickerState` 均已实现。Run 时的 `resolveFileMentions` → XML `<file>` 注入已就绪。

### 5. Refocus input bar when agent becomes idle

**已核实：** `InputBar.tsx` 通过监听 agent 状态变化实现重新聚焦。所有复选框均已勾选。

### 6. Agent Skills system (highest priority)

**已核实：** Layer 1（`/` palette）、Layer 2a（activation inject）、Layer 2b（`load_skill` tool）、Layer 2c（system metadata catalog）均已实现。Phase D（user skills）已发布。Stepped closure（`skill-compose-inject.spec.ts` Playwright E2E）已存在。

### 7-11. 其他已发布功能

全部通过代码库核实确认。详见上方表格。

### 13. Real file explorer (create/delete/rename/move)

**已核实：** 已完成。`FilesController` 中包含 `createFolder`、`createFile`、`move`、`rename`、`fsCopy`。`FilesPanel.tsx` 支持右键菜单（`FileContextMenu.tsx`）、内联重命名、拖拽移动（`MoveDialog.tsx` + HTML5 DnD between `TreeNode`s）、工具栏（`FilesToolbar.tsx`）。`file-explorer.spec.ts` E2E 测试已存在。自动刷新通过 `filesVersion` 实现。

### 14. `@` mention for open tabs

**已核实：** 已完成。`resolve-tab-mentions.ts` 包含 `parseTabMentions`、`resolveTabMentions`、`buildTabContextXmlBlock`。`detect-mention-state.ts` 包含 `tabsToPickerItems`、`buildTabMentionToken`（过滤 `chrome-extension://` / `chrome://`）。`use-picker.ts` 在 `@` picker 打开时加载标签页，订阅 `tabs.onUpdated/onRemoved`，标签页项目与文件项目合并。`merge-run-task.ts` 在处理 agent 消息前会 `stripTabMentions`。

---

## 候选功能详情

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
