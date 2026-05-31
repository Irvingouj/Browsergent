# Implementer Prompt

Read `AGENTS.md` first and follow it strictly.

Fix two chat bugs in Browsergent:

1. Chat history is wiped after each new prompt.
2. Assistant responses do not stream while the model is generating.

## Requirements

- Do not clear `messages` in `src/sidepanel/app.tsx` when a new prompt starts.
- Capture `taskInput.trim()` into a local `task`, then clear only the input.
- Keep prior user, assistant, and system messages visible.
- Preserve action trace or add explicit run boundaries; do not silently wipe it.
- Pass visible prior chat context into the next provider request so UI history and model context match.
- Add streaming support to the Anthropic-compatible provider path.
- Use `stream: true` and parse SSE deltas from `response.body`.
- Render one assistant message as deltas arrive; append later deltas to that same message by id.
- Do not create one message per chunk.
- When the stream completes, pass the final assembled assistant text/tool calls to pi-core.
- Stop must abort streaming and leave partial assistant text visible.
- Keep tool execution working through typed `BrowserCommand`.
- No `any`, no `Object`, no arbitrary eval, no forbidden escape hatches.

## Tests

Add regression coverage:

- Two prompts in one side-panel session keep prompt 1 and answer 1 visible after answer 2 appears.
- Mocked streaming response emits delayed chunks, and partial assistant text appears before the final chunk.
- The final streamed response is rendered as one assistant message.
- Prior visible transcript is included in the second provider request.

## Verify

Run:

```bash
npm run typecheck
./scripts/build.sh
npm test -- --workers=1
rg "\bany\b|\bObject\b|console\.log|eval\(|new Function|@ts-expect-error|eslint-disable" src tests
```

Definition of done: chat transcript persists, assistant text streams visibly, stop preserves partial output, tool-use still works, and all checks pass.
