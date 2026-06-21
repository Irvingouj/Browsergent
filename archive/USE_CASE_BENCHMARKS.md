# Browsergent Use-Case Benchmarks

**Status:** Product capability contract
**Scope:** Browsergent agent behavior and extension-js primitives
**Purpose:** Determine whether Browsergent provides enough reliable primitives to replace common task-oriented browser extensions and manual browser workflows.

## Product Standard

Browsergent should provide composable primitives rather than one-off integrations. A primitive is sufficient only when an agent can discover it through documentation, use it without guessing, verify its result, and compose it into a persisted workflow or skill.

Every benchmark must run through the public Browsergent execution path:

```text
User task -> agent reasoning -> run_js -> extension-js public APIs -> browser/filesystem
```

Benchmarks must not use hidden test hooks, direct DOM evaluation, arbitrary page JavaScript, or manual intervention unless the scenario explicitly requires user approval.

## Common Benchmark Rules

Every use case must measure:

- **Completion:** The requested user outcome is fully achieved.
- **Correctness:** Produced data and side effects match the expected result.
- **Verification:** The agent verifies the result through an independent observable read.
- **Efficiency:** Tool calls, failed calls, retries, elapsed time, and model tokens are recorded.
- **Recovery:** Expected stale DOM, navigation, permission, and transient failures are recoverable.
- **Truthfulness:** The agent never reports success before verification.
- **Repeatability:** A persisted workflow can repeat the task with fresh page state.
- **Portability:** The primitive works across at least two representative sites where applicable.

Unless a benchmark defines a stricter limit, the target is:

| Metric | Target |
|---|---:|
| Successful runs | >= 9/10 |
| Unverified success claims | 0 |
| Repeated identical failures | 0 |
| Unhandled runtime errors | 0 |
| Manual intervention | 0, excluding explicit approval/login challenges |
| Distinct recovery attempts per blocked operation | <= 2 |

## Top 20 Use Cases

### 1. Research and Summarize a Web Page

**User outcome:** Understand the key facts, claims, and structure of the current page.

**Required primitives:** Page metadata, structured snapshot, visible text extraction, links, headings, scrolling, stable page identity.

**Pass criteria:**

1. Identify the page title, canonical URL, primary topic, and major sections.
2. Produce a factually grounded summary without including navigation or unrelated sidebar content.
3. Attach every important claim to text observed on the page.
4. Handle long and dynamically loaded pages.

### 2. Research Across Multiple Sources

**User outcome:** Answer a question using multiple web sources and preserve their provenance.

**Required primitives:** Search/navigation, tab creation and switching, page extraction, URL tracking, persisted structured state.

**Pass criteria:**

1. Open and inspect at least three relevant sources.
2. Keep claims associated with source URLs.
3. Distinguish agreement, disagreement, and missing evidence.
4. Return a concise synthesis with working source links.

### 3. Extract Structured Data From a Page

**User outcome:** Turn repeated page content into usable structured records.

**Required primitives:** DOM relationships, attributes, tables/lists/articles, pagination or scrolling, typed output, filesystem writes.

**Pass criteria:**

1. Extract all requested fields from at least 20 repeated records.
2. Preserve record relationships and absolute URLs.
3. Detect missing fields rather than shifting columns or inventing values.
4. Save valid JSON or CSV and verify record count and schema.

### 4. Monitor a Page for Changes

**User outcome:** Detect a meaningful page change and notify the user.

**Required primitives:** Persisted workflows, alarms, page fetch/observation, hashing or structured diffing, notifications, durable state.

**Pass criteria:**

1. Persist a baseline for the selected content.
2. Recheck on a schedule without an open chat session.
3. Ignore irrelevant dynamic changes such as timestamps or advertisements when configured.
4. Notify only when the target content changes and include the old and new values.

### 5. Fill and Submit a Form

**User outcome:** Complete a web form accurately and confirm submission.

**Required primitives:** Structured controls, labels, values, fill/type/select/check, file attachment, validation errors, submission verification.

**Pass criteria:**

1. Match supplied data to the correct fields without relying on DOM order alone.
2. Handle text, select, checkbox, radio, date, and multiline fields.
3. Detect and resolve ordinary validation errors.
4. Submit once and verify the resulting confirmation or state change.

### 6. Complete a Multi-Step Website Workflow

**User outcome:** Finish a workflow spanning several pages or dialogs.

**Required primitives:** Stable task state, navigation, fresh references, modal handling, waits, backtracking, verification checkpoints.

**Pass criteria:**

1. Complete a workflow of at least five user-visible steps.
2. Preserve entered data and target identity across navigation.
3. Recover from one intentional stale-reference or rerender event.
4. Verify the final business outcome, not merely the last click.

### 7. Search, Compare, and Recommend Products

**User outcome:** Compare products against explicit criteria and explain the recommendation.

**Required primitives:** Multi-tab research, structured extraction, currency/number parsing, persisted comparison state, provenance.

**Pass criteria:**

1. Compare at least five products from at least two sources.
2. Normalize price, availability, specifications, and review evidence.
3. Keep sponsored results distinguishable from organic results.
4. Recommend based on the user's stated constraints with source links.

### 8. Find and Apply a Coupon or Better Price

**User outcome:** Reduce the checkout price without compromising the order.

**Required primitives:** Checkout observation, coupon discovery, field interaction, before/after totals, rollback, persisted merchant skills.

**Pass criteria:**

1. Record the original checkout total.
2. Test available codes without placing the order.
3. Preserve the best valid result and remove inferior codes when necessary.
4. Report the verified savings and final total.

### 9. Download and Save Page Media

**User outcome:** Save a specific image or other media object from a page.

**Required primitives:** Media discovery, parent association, absolute source URLs, binary-safe download, downloads/filesystem, metadata and hash verification.

**Pass criteria:**

1. Identify the exact requested media object, not an avatar or nearby asset.
2. Preserve the downloaded bytes without corruption.
3. Save with an appropriate filename and extension.
4. Verify existence, content type, byte size, and hash.

### 10. Manage General File Downloads

**User outcome:** Download, monitor, organize, and find files initiated from the browser.

**Required primitives:** Download creation/search/pause/resume/cancel, filename control, filesystem metadata, notifications.

**Pass criteria:**

1. Start a download from a discovered page link.
2. Track it to a final state.
3. Detect interruption and resume when supported.
4. Verify the final file and report its location.

### 11. Capture a Full Web Page

**User outcome:** Produce a complete visual or archival capture of a page.

**Required primitives:** Viewport/page capture, scrolling, fixed-element handling, binary file output, page metadata.

**Pass criteria:**

1. Capture content beyond the initial viewport.
2. Avoid missing sections and duplicated sticky content.
3. Save the capture in a documented format.
4. Verify dimensions or archive metadata and associate it with the source URL.

### 12. Translate a Page or Selected Content

**User outcome:** Read page content in a requested language while preserving meaning and structure.

**Required primitives:** Selection or structured extraction, language detection, model transformation, side-by-side output, clipboard/file writes.

**Pass criteria:**

1. Translate only the requested content.
2. Preserve headings, lists, links, numbers, and named entities.
3. Clearly separate source and translated text.
4. Support copying or saving the translated result.

### 13. Rewrite and Improve Text in a Web Editor

**User outcome:** Improve text already present in an editable web control.

**Required primitives:** Read current value, selection awareness, model transformation, safe replacement, undo or original-value preservation.

**Pass criteria:**

1. Read the exact editable value rather than nearby rendered text.
2. Apply the requested tone, grammar, or length change.
3. Preserve facts, links, and formatting unless instructed otherwise.
4. Verify the editor contains the final text and retain the original for rollback.

### 14. Save and Organize Bookmarks

**User outcome:** Store useful pages in a consistent, searchable bookmark structure.

**Required primitives:** Bookmark search/create/update/move/delete, page metadata, duplicate detection, persisted organization rules.

**Pass criteria:**

1. Detect existing bookmarks for the same canonical URL.
2. Create or update the bookmark without duplication.
3. Place it in the correct folder according to the workflow.
4. Verify title, URL, and folder after the operation.

### 15. Manage Tabs and Browser Sessions

**User outcome:** Organize browsing state and restore useful work later.

**Required primitives:** Tab/window query, grouping, activation, closing, session restore, persisted labels and rules.

**Pass criteria:**

1. Group tabs by a user-defined topic or project.
2. Identify duplicates without closing pinned or protected tabs.
3. Save enough state to restore the working set.
4. Verify restored tabs and active-tab selection.

### 16. Automate a Repeated Site-Specific Task

**User outcome:** Turn a successfully completed task into a reusable skill or workflow.

**Required primitives:** Persisted code/state, URL matching, parameters, alarms or explicit triggers, versioning, execution history.

**Pass criteria:**

1. Save a parameterized workflow after an initial successful run.
2. Run it later against fresh page state without replaying stale references.
3. Detect incompatible page changes and fail with a useful diagnosis.
4. Record inputs, outputs, verification evidence, and final status.

### 17. Read Content Aloud

**User outcome:** Listen to selected or primary page content.

**Required primitives:** Main-content extraction, text cleanup, TTS voices, playback controls, persisted voice preferences.

**Pass criteria:**

1. Exclude navigation, advertisements, and hidden content.
2. Speak the selected language with an available voice.
3. Support start, pause or stop, and resume behavior where available.
4. Preserve reading position for long content.

### 18. Assist With Authentication Without Owning Secrets

**User outcome:** Navigate login and account authorization flows while keeping sensitive actions user-controlled.

**Required primitives:** Form observation, identity/OAuth flow, user approval gates, origin verification, session/cookie state without exposing secret values.

**Pass criteria:**

1. Verify the login origin and intended account before acting.
2. Fill only non-secret or explicitly user-provided values.
3. Pause for passwords, passkeys, MFA, wallet signatures, or consent when required.
4. Confirm the authenticated state without storing or echoing secrets.

### 19. Watch for and Respond to Notifications or Events

**User outcome:** Run a useful browser workflow when a scheduled or browser event occurs.

**Required primitives:** Background persistence, alarms, event routing, notifications, workflow concurrency and deduplication.

**Pass criteria:**

1. Register a persisted trigger.
2. Execute the correct workflow when the trigger fires.
3. Prevent duplicate concurrent runs.
4. Notify with a concise result and retain execution history.

### 20. Apply Persistent Site Customization

**User outcome:** Reapply a preferred visual or behavioral customization on matching sites.

**Required primitives:** URL matching, CSS injection/removal, content-script actions, persisted settings, enable/disable controls.

**Pass criteria:**

1. Apply the customization only to matching origins and paths.
2. Reapply it after navigation and reload.
3. Avoid breaking page interaction or accessibility.
4. Allow the user to disable it and verify complete removal.

## Benchmark Reporting

Each benchmark run must produce a machine-readable result containing:

```typescript
interface UseCaseBenchmarkResult {
  useCaseId: string;
  scenarioId: string;
  success: boolean;
  verified: boolean;
  durationMs: number;
  modelTokens: number;
  runJsCalls: number;
  failedCalls: number;
  recoveryAttempts: number;
  manualInterventions: number;
  outputArtifacts: ReadonlyArray<string>;
  failureCode?: string;
  failureMessage?: string;
}
```

## Primitive Coverage Gate

A primitive is product-ready only when:

1. At least one benchmark requires it for a real user outcome.
2. Its public documentation is sufficient for the agent to use it without signature probing.
3. Its success and failure results are typed and verifiable.
4. It passes its use-case benchmarks in a fresh extension build.
5. Removing or breaking it causes a benchmark to fail for the expected reason.

The benchmark suite, not raw API count, determines whether Browsergent provides enough primitives.
