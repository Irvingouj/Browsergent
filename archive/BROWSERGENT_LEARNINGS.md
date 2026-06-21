# Browsergent Learnings

Source: `problematic-conversation.json`, exported 2026-06-03.

## What Happened

The user first asked what page they were on. Browsergent eventually answered correctly: Indeed Canada at `https://ca.indeed.com/`.

The user then asked for all part-time jobs in Ottawa posted in the last 7 days. Browsergent navigated to an Indeed search page whose title reported 394 jobs. It summarized visible listings from the first result page, then told the user there were 394 total results.

When the user challenged that this was not all and asked for all jobs organized into a CSV, Browsergent did not complete the collection. It repeatedly retried snapshots, navigations, alternate URLs, and API calls. Many attempts returned `{}`, empty `Error:`, or `Failed to get page snapshot`. No complete CSV was produced.

## Diagnosis

This was mostly a Browsergent contract and product-behavior problem, with model mistakes on top.

Browsergent is now using the JavaScript WASM runtime. The issue was not that JavaScript was the wrong runtime. The issue was that the model-facing contract was too loose: it encouraged generic JavaScript execution instead of a constrained Browsergent automation workflow with clear observation, extraction, pagination, and completion rules.

The model also made bad task-completion decisions:

- It treated a reported result count as if records had been extracted.
- It summarized only visible first-page listings while implying broader coverage.
- It did not build a pagination or extraction plan for the user's "all" request.
- It kept retrying after repeated failed observations instead of reporting a blocker.

The runtime/tooling feedback was also weak:

- Failed observations often appeared as `{}` or empty errors.
- Snapshot failures did not include actionable cause, code, or retry guidance.
- Tool results were plain text rather than structured observations the model could reason about reliably.

## Improvements

### 1. Make the Agent Tool Contract Unambiguous

Browsergent must expose the same acting surface the product promises.

- The LLM's browser tool should be a constrained JavaScript WASM execution tool, currently `run_js`.
- Tool descriptions should show only Browsergent-safe JavaScript patterns.
- The system prompt should state that JavaScript runs in Browsergent's WASM automation runtime and must use the typed `page.*` API.
- Naming should not mix obsolete Lua concepts into the model-facing path.
- Tests should assert the agent tool list and system prompt do not drift from this contract.

### 2. Add Evidence Discipline

Browsergent must separate what it observed from what a page reports.

- A search title saying "394 jobs" is a reported count, not 394 extracted jobs.
- Final answers should include extracted row count and source of any total count.
- The agent must not claim "all" unless all required records were observed or a blocker was reported.
- Summaries should only describe records actually seen.

### 3. Inject Initial Page Context

At the start of an agent run, Browsergent should take a current page snapshot and provide it as model context.

This gives the agent immediate awareness of:

- current URL
- page title
- visible controls and content
- available `ref_id`s from the first observation

Important constraints:

- The injected snapshot is initial context, not permanent truth.
- Before any action that depends on a `ref_id`, the agent should refresh the snapshot if the page changed.
- If the initial snapshot fails, the run should start with a clear page-observation blocker instead of making the model guess.
- The context should be compact enough to avoid crowding out task-relevant reasoning.

This should reduce the first-turn "what page am I on?" overhead and make Browsergent feel page-aware immediately.

### 4. Define Completion Criteria for "All" Tasks

For collection tasks, the agent needs explicit done rules.

- Identify the target set and desired output schema.
- Extract records from the current page.
- Deduplicate by stable key when available, such as listing URL or job id.
- Paginate or continue loading until no next page, no new records, or the reported count is reached.
- If blocked, return a partial result with a clear reason and collected count.

### 5. Add a Data Extraction Mode

CSV and table-producing tasks should use a dedicated workflow.

- Infer columns from the task and page type.
- Collect rows as structured records before formatting.
- Normalize missing fields rather than inventing values.
- Track source URL and collection status.
- Produce CSV from observed rows only.

### 6. Improve Failure Handling

Repeated failed observations should trigger diagnosis instead of random retries.

- After two similar failed snapshots, classify the failure.
- Preserve the last known good URL, title, and collected records.
- Stop changing URLs blindly.
- Report a blocker when the page cannot be observed.
- Keep the user-facing answer honest: complete, partial, or blocked.

### 7. Return Structured Tool Results

The model should receive typed results, not only text logs.

Useful shape:

```ts
type ToolObservation =
  | { ok: true; kind: "snapshot"; url: string; title: string; elements: ElementSnapshot[] }
  | { ok: true; kind: "text"; value: string }
  | { ok: false; code: ErrorCode; message: string; details?: Record<string, unknown> };
```

Readable text can still be included, but typed facts should drive reasoning.

### 8. Keep an Agent Task Ledger

Long tasks need compact state that survives tool loops.

For the Indeed task, the ledger should have tracked:

- query: part-time jobs in Ottawa posted in last 7 days
- reported total: 394
- extracted rows: count and stable ids
- visited pages: result page numbers or URLs
- next action: paginate, extract, or report blocker
- collection status: complete, partial, or blocked

### 9. Test the Behavior That Failed

Add tests for the exact product risks exposed here.

- The model-facing agent tool is only the intended acting tool.
- Prompt/tool docs match the JavaScript WASM runtime and typed `page.*` acting model.
- Agent runs start with current page context when snapshot succeeds.
- "All results" tasks require pagination or an explicit blocker before final completion.
- The final answer cannot claim all rows when extracted count is below reported count.
- Repeated snapshot failures produce a blocker message, not endless retries.
- CSV output contains only observed records and marks partial when incomplete.

## Principle

Browsergent should be accountable to observed evidence. It can be autonomous, but it cannot be allowed to confuse a plausible page count, a first-page summary, or repeated retries with task completion.
