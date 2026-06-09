---
name: capability-check
description: Runs a structured page capability probe via run_js. Use when testing Browsergent on the current tab or when the user asks for a capability check.
disable-model-invocation: true
---

# Capability Check

Structured workflow to verify Browsergent can observe and interact with the current page.

## Instructions

1. Call `get_doc({ namespace: "page" })` before any `run_js` that uses page APIs.
2. Run a read probe: `page.url()`, `page.title()`, and `page.snapshot()`.
3. Log each result with `console.log`.
4. If you see content-script connection errors, follow recovery hints in the error (e.g. `page.goto` current URL once).
5. Summarize what worked and what failed — do not claim success without observable proof.

## Optional reference

For the full checklist, call `load_skill({ skill: "capability-check", path: "references/checklist.md" })`.

## Arguments

User focus area: $ARGUMENTS
