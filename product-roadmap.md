# Browsergent - Product Roadmap

## Product

Browsergent is an AI browser operator in the Chrome side panel.

The customer says what they want done on the current page. Browsergent sees the page, uses visible controls, and reports the result.

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
Lua
Chrome API knowledge
LLM tool-call knowledge
```

## First Screen

```text
Browsergent
Current tab: example.com
Status: Ready

[conversation and action trace]

[Stop] Steps: 0/20
[Type a task...              ][Run]
```

## Core Experience

Successful run:

```text
User: Fill the email field with test@example.com and submit.
Agent: I will inspect the page.
Trace: page_snapshot -> ok, 5 elements
Trace: page_fill e2 "test@example.com" -> ok
Trace: page_click e4 -> ok
Agent: Done. I filled the email field and clicked Submit.
```

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

The side panel shows user messages, assistant messages, action trace, run status, step count, stop control, and settings.

Notebook cells are not the primary interface, but Lua playbooks are a required product capability.

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

| Tool | Customer-visible result |
|------|-------------------------|
| `page_snapshot` | Agent sees current controls |
| `page_click` | Agent clicks an element |
| `page_fill` | Agent fills an input |
| `page_clear` | Agent clears an input |
| `page_select` | Agent selects an option |
| `page_press` | Agent presses a key |
| `page_scroll` | Agent scrolls |
| `page_extract` | Agent reads page text |
| `page_goto/back/forward/reload` | Agent navigates current tab |

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
| M1 Extension Opens | Side panel opens and agent runtime loads |
| M2 Agent Talks | Customer sends task and gets assistant response |
| M3 Agent Sees | Agent describes active tab from snapshot |
| M4 Agent Acts | Agent fills, clicks, selects, scrolls, extracts |
| M5 Agent Completes Task | Agent completes one simple workflow end to end |
| M6 Usable v1 | Repeated manual use works with clear errors and tests |

## v1 Success Criteria

```text
1. A non-technical user understands the first screen.
2. Tasks are entered in plain English.
3. Agent can inspect the active page.
4. Agent can fill and click real elements.
5. Every action is visible.
6. Stop works.
7. Blocked states are clear.
8. No broad host permissions are required.
```

## Design Rules

```text
Agent-first UI.
Typed browser tools only.
ref_id instead of selectors.
activeTab instead of broad host permissions.
Side panel Worker owns long-running state.
Background only routes.
Content script only executes typed commands.
```
