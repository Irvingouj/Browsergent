# Browsergent - Product Roadmap

## Product

Browsergent is an AI browser operator in the Chrome side panel with two required interfaces:

1. **Agent Chat** (primary): Customer says what they want done, Browsergent sees the page, uses visible controls, and reports the result.
2. **Lua Playbooks** (required): Power users write Lua scripts that control the browser through the same typed command protocol.

## Customer Point of View

The customer wants outcomes, not automation primitives.

They say:

```text
"Fill this form."
"Search this site."
"Find the cheapest option."
"Summarize this page."
"Click through this simple workflow."
```

They expect:

```text
plain English input
no selector writing
visible progress
visible action history
safe stopping
clear blocked states
no hidden automation
```

They should never need:

```text
DOM knowledge
CSS selectors
JavaScript
Chrome API knowledge
LLM tool-call knowledge
```

Lua playbook users need Lua knowledge. That is expected and supported as a first-class capability.

## First Screen

```text
Browsergent
Current tab: example.com
Status: Ready

[Chat] [Lua]                     <- tab switcher

[conversation and action trace]   <- shared trace for both modes

[Stop] Steps: 0/20
[Type a task...              ][Run]
```

## Core Experience

Successful run:

```text
User: Fill the email field with test@example.com and submit.
Agent: I will inspect the page.
Trace: run_lua -> page.snapshot() -> ok, 5 elements
Trace: run_lua -> page.fill("e2", "test@example.com") -> ok
Trace: run_lua -> page.click("e4") -> ok
Agent: Done. I filled the email field and clicked Submit.
```

The LLM generates Lua code, which calls page.* APIs. Each run_lua invocation may contain multiple page.* operations.

Blocked run:

```text
Trace: page_snapshot -> ok, 2 elements
Agent: I could not find a submit button on this page.
Status: Needs user input
```

Stopped run:

```text
Status: Stopped by user
Trace remains visible
```

## v1 Requirements

### Chat

The side panel shows user messages, assistant messages, action trace, run status, step count, stop control, and settings. Chat is the primary interface.

### Lua Playbooks

The side panel provides a Lua code editor and run button. Users write playbooks using the `page.*` API. Playbooks execute through the same content-script BrowserCommand path as the agent. Action trace is shared and always visible. Lua playbooks are a required, first-class capability.

### Page Awareness

`page_snapshot` must return:

```text
URL
title
timestamp
visible interactive elements
ref_id
role
tag
text
label
placeholder
safe value
enabled/visible state
key attributes
```

### Page Actions

The LLM has a single tool: `run_lua`. It generates Lua code that calls these `page.*` APIs:

| Lua API | Customer-visible result |
|---------|-------------------------|
| `page.snapshot()` | Agent sees current controls |
| `page.click(ref_id)` | Agent clicks an element |
| `page.fill(ref_id, text)` | Agent fills an input |
| `page.clear(ref_id)` | Agent clears an input |
| `page.select(ref_id, value)` | Agent selects an option |
| `page.press(key)` | Agent presses a key |
| `page.scroll(direction, amount?)` | Agent scrolls |
| `page.extract(ref_id?)` | Agent reads page text |
| `page.goto(url)` / `page.back()` / `page.forward()` / `page.reload()` | Agent navigates current tab |

The LLM never calls these directly — it generates Lua code that calls them.

### Trace

Every action trace entry includes:

```text
step
tool
arguments
status
result summary
timestamp
```

### Control

The customer always has Stop. Default max steps is 20. Errors must be visible and specific.

## v1 Non-Goals

```text
multi-tab workflows
cookies/bookmarks/history
iframe traversal
shadow DOM traversal
screenshot understanding
record/replay
long-term memory
background autonomy
general JavaScript eval
selector-based actions
```

## Product Milestones

| Milestone | Customer-visible result |
|-----------|-------------------------|
| M1 Extension Opens | Side panel opens, agent runtime and Lua runtime load |
| M2 Agent Talks | Customer sends task and gets assistant response |
| M3 Agent Sees | Agent describes active tab from snapshot |
| M4 Agent Acts | Agent fills, clicks, selects, scrolls, extracts |
| M5 Agent Completes Task | Agent completes one simple workflow end to end |
| M5.5 Lua Playbooks | User writes Lua playbook that fills and clicks real elements |
| M6 Usable v1 | Both surfaces work with clear errors, shared trace, and tests |

## v1 Success Criteria

```text
1. A non-technical user understands the first screen.
2. Tasks are entered in plain English (chat) or Lua (playbooks).
3. Agent can inspect the active page.
4. Agent can fill and click real elements.
5. Lua playbooks can fill and click real elements.
6. Every action is visible in shared trace.
7. Stop works for both agent and Lua.
8. Blocked states are clear.
9. No broad host permissions are required.
```

## Design Rules

```text
Agent-first UI with required Lua playbook surface.
LLM → run_lua → Lua → page.* — the only execution path.
LLM's only tool is run_lua. LLM does reasoning, Lua does acting.
Typed browser commands only (shared by agent and Lua).
ref_id instead of selectors.
activeTab instead of broad host permissions.
Side panel Worker owns long-running state.
Background only routes.
Content script only executes typed commands.
Lua page.* API yields BrowserCommand through the same content-script path.
```
