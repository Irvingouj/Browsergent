# AGENTS.md

Rules for agents working in this repository.

## What This Repo Is

Browsergent is a Chrome MV3 browser-agent extension.

Current shape:
- Side panel UI: Preact, Zustand, Tailwind CSS.
- Worker: coordinates agent runs, provider calls, and the `@pi-oxide/pi-host-web` WASM brain.
- Browser acting: `@pi-oxide/extension-js` executes generated `run_js`; page operations go through typed commands.
- Content/background scripts: Chrome APIs, tab routing, page snapshots, and DOM actions.
- Storage/controllers: settings, sessions, files, skills, and persisted UI state.

Core invariant: the model reasons and writes JavaScript, but it does not call Chrome or DOM APIs directly. Browser side effects go through the extension runtime and typed host protocol.

Do not duplicate canonical type definitions in this file. Source types are the truth:
- `src/types`
- `src/protocol`
- `src/state/slices`
- `src/errors`

## Priority Order

The top three principles are:

1. Readability.
2. Maintainability.
3. Correctness.

Never sacrifice these three for development speed or performance. Performance work is valid only after the readable, maintainable, correct design is clear.

## Work Order

Default order for code changes:

1. Types first: model the real states and boundaries.
2. Tests second: lock the expected behavior or failure mode.
3. Implementation last: make the typed tests pass.

For refactors, keep behavior fixed unless the task explicitly changes behavior.

## Type Rules

TypeScript must be strict and explicit.

- Never use `any`: not in parameters, returns, casts, generics, tests, or mocks.
- Never use `Object`. Use a named type or `Record<string, unknown>`.
- Every `unknown` must have a short comment explaining why the value is truly external or intentionally opaque.
- Narrow `unknown` immediately at the boundary. Do not pass `unknown` deeper into the system.
- Define named types for every message, command, event, result, snapshot, provider config, and persisted shape.
- Use enums for closed internal sets whenever practical.
- Use exhaustive `switch` handling for enums and discriminated unions. A missing case should fail typecheck.
- String literal unions are acceptable for external wire strings or existing protocol tags, but still require exhaustive handling.
- Optional fields are allowed only when absence is real business state. Do not use `?` to avoid constructing valid data.
- Prefer readonly arrays/objects when callers must not mutate returned data.

## Boundary Rules

External data must be validated at the first boundary.

External data includes:
- Chrome messages.
- Content script messages.
- Worker messages.
- Provider API responses.
- Storage reads.
- User-entered settings.
- Imported files or skill content.

Rules:
- Validate with zod or a hand-written type guard.
- If external data is structurally wrong, throw immediately at the boundary.
- Do not allow malformed data to enter the state store, worker, provider layer, or command executor.
- Expected runtime failures return typed errors or `Result`-style unions.
- Impossible states, programmer errors, and invalid boundary data should throw early.
- Error objects must carry a machine-readable code and human-readable message.
- Never catch and discard. Never `.catch(() => {})`.

## State Rules

Make invalid states unrepresentable.

- Store complete, valid entities.
- Do not persist half-valid config.
- Do not represent required relationships with nullable or optional fields.
- If one provider owns many models, model that relationship directly.
- If one value determines valid choices for another value, encode that in the type or validate at the boundary before storage.
- Prefer discriminated unions over parallel booleans.
- Keep source-of-truth state small; derive display state from selectors/helpers.

## Provider Rules

Provider code must separate:

- Provider: auth, exact endpoint URLs, wire format, discovery endpoint.
- Model: provider model id, display name, token limit parameter, model-specific options.

Endpoint URLs are exact. Do not append paths in code. If the user configures the wrong URL, fail early with a useful error.

First-class providers should respect their discovery APIs when available. Compatible providers should be configurable without code changes where the wire format is already supported.

## Browser Extension Rules

The side panel is the extension UI, not the automation target.

- `chrome-extension://` and `chrome://` pages must never be treated as the active target tab for `page.*`.
- `page.goto`, `page.snapshot`, `page.click`, and related commands operate on an http(s) tab.
- Do not let side-panel navigation destroy the worker/main-thread relay.
- The agent core and generated JS runtime must not access `document`, `window`, `chrome.*`, `fetch`, cookies, or localStorage directly.
- Real browser effects belong in the TypeScript extension adapter/content script path.

## Architecture Boundaries

- Rust/WASM owns agent state-machine decisions and runtime-free core logic.
- TypeScript owns Chrome APIs, DOM effects, UI, storage, provider HTTP calls, and message routing.
- Boundaries are typed messages, never raw bags or ad hoc objects.
- Shared behavior belongs in a small helper only when it protects an invariant or removes real duplication.

## Testing Rules

Browsergent is tested as a real Chrome extension for E2E.

- Unit tests: `npm run test:unit`.
- E2E tests: `npm run test`.
- Typecheck: `npm run typecheck`.
- Build: `npm run build`.
- Smoke: `npm run smoke`.

For non-trivial changes, leave the smallest useful test that fails without the change.

Test the public behavior, not private implementation details. Use fixtures that match the current persisted and message shapes.

## Coding Style

- Work inside the existing design frame when that frame is healthy.
- A small patch is only good when it preserves readability, maintainability, and correctness.
- If the requested change would duct-tape around a rotting area, stop and propose the refactor instead.
- Treat long functions, unclear control flow, fragile coupling, duplicated business rules, and hard-to-comprehend code as design smells.
- Do not continue piling code onto a smell just because it is the file currently being edited.
- Do not refactor unrelated healthy code.
- Remove dead code created by your change.
- Do not delete unrelated existing dead code unless asked.
- Prefer boring code over clever code.
- Do not add abstractions for one caller.
- Do not add dependencies unless the existing stack cannot reasonably solve the problem.
- Comments explain why, not what.
- No `console.log` in committed code. Use structured diagnostics or remove debug output.

## UI Rules

- Build the working product surface, not a marketing page.
- Keep controls predictable and dense enough for repeated use.
- Use native controls when they fit.
- Text must not overlap, overflow controls, or depend on viewport-scaled font sizes.
- Keep accessibility basics: labels, disabled states, keyboard-reachable controls, useful error text.

## Commands

```bash
npm install
npm run typecheck
npm run test:unit
npm run test
npm run test:all
npm run build
npm run dev
npm run smoke
```

Load unpacked extension from `dist/` in Chrome Developer Mode.
