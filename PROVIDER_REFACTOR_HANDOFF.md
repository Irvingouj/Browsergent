# Provider Refactor Handoff

## Current Status

Implemented the core provider/model refactor in source. `npm run typecheck` passes.

Working tree is dirty and not committed. Main changed files:

- `src/types/messages.ts`
- `src/state/slices/settings-slice.ts`
- `src/worker/provider-defaults.ts`
- `src/worker/provider-request.ts`
- `src/worker/provider-model.ts`
- `src/worker/openai.ts`
- `src/worker/openai-types.ts`
- `src/worker/anthropic.ts`
- `src/worker/anthropic-prompts.ts`
- `src/sidepanel/app.tsx`
- `src/sidepanel/components/SettingsPanel.tsx`
- `src/sidepanel/components/test-connection.ts`
- `src/sidepanel/components/use-title-generation.ts`
- `src/sidepanel/components/model-discovery.ts`
- `src/storage/migrate.ts`
- some unit tests partly updated

## Product Decision Captured

No backward compatibility. This has not shipped.

Provider config now owns connection details:

- `kind`
- `apiKey`
- exact `chatEndpointUrl`
- optional exact `modelsEndpointUrl`
- `models`
- `defaultModelId`

Model config now owns model-level behavior:

- `id`
- display `name`
- provider model id `model`
- optional `tokenLimitParam`

Endpoint URLs are exact. Do not append `/v1/...` in code. If the user enters a wrong endpoint, config is wrong.

First-class providers:

- `anthropic`
- `openai`
- `deepseek`

Custom compatibility providers:

- `openai-compatible`
- `anthropic-compatible`

Discovery is only for first-class providers for now. Custom compatible providers use manual model rows.

## Source Implementation Notes

`ProviderKind` is now:

```ts
"anthropic" | "openai" | "deepseek" | "openai-compatible" | "anthropic-compatible"
```

`WorkerSettings` now sends:

```ts
{
  kind,
  apiKey,
  chatEndpointUrl,
  model,
  tokenLimitParam,
}
```

`provider-request.ts` maps wire formats:

- `anthropic`, `anthropic-compatible` use Anthropic Messages wire format.
- `openai`, `deepseek`, `openai-compatible` use OpenAI Chat Completions wire format.

`buildProviderRequest` uses exact `chatEndpointUrl.trim()`.

`buildProviderChatBody` uses explicit `tokenLimitParam`, so OpenAI can use `max_completion_tokens` and compatible providers can use `max_tokens`.

`SettingsPanel.tsx` now has:

- provider list
- add buttons for all five provider kinds
- provider edit form
- exact chat endpoint field, still test id `settings-baseurl-input`
- models endpoint field
- fetch models button for Anthropic/OpenAI/DeepSeek only
- default model dropdown
- manual model add/delete
- per-model token parameter select for OpenAI-wire providers

`model-discovery.ts` fetches:

- Anthropic with `x-api-key` and `anthropic-version`
- OpenAI/DeepSeek with Bearer auth

It parses `{ data: [{ id, display_name? }] }`.

## Verified

Ran:

```bash
npm run typecheck
```

Result: pass.

## Still To Do

Update stale tests. Current grep still shows old `baseUrl`/single-model assumptions mostly in tests:

- `tests/unit/selectors.spec.ts`
- `tests/unit/settings-slice.spec.ts`
- `tests/unit/settings-controller-indexeddb.spec.ts`
- `tests/unit/settings-controller-error.spec.ts`
- `tests/unit/settings-form.spec.tsx`
- `tests/unit/settings-error-ui.spec.tsx`
- `tests/unit/migrate.spec.ts`
- `tests/unit/message-bubble.spec.tsx`
- `tests/settings-provider-crud.spec.ts`
- `tests/settings-persistence.spec.ts`
- `tests/settings-test-connection.spec.ts`
- `tests/helpers.ts`

Some provider tests were already partially updated:

- `tests/unit/test-connection.spec.ts`
- `tests/unit/openai-provider.spec.ts`
- `tests/unit/anthropic-provider.spec.ts`

Re-run and finish:

```bash
npm run typecheck
npm run test:unit
```

Likely fixture shape needed:

```ts
const provider: ProviderConfig = {
  id: "p1",
  name: "Anthropic",
  kind: "anthropic",
  apiKey: "sk-test",
  chatEndpointUrl: "https://api.anthropic.com/v1/messages",
  modelsEndpointUrl: "https://api.anthropic.com/v1/models",
  defaultModelId: "m1",
  models: [
    {
      id: "m1",
      name: "claude-sonnet-4-20250514",
      model: "claude-sonnet-4-20250514",
      tokenLimitParam: "max_tokens",
    },
  ],
};
```

For OpenAI use:

- `chatEndpointUrl: "https://api.openai.com/v1/chat/completions"`
- `modelsEndpointUrl: "https://api.openai.com/v1/models"`
- model token param `max_completion_tokens`

For DeepSeek use:

- `chatEndpointUrl: "https://api.deepseek.com/chat/completions"`
- `modelsEndpointUrl: "https://api.deepseek.com/models"`
- model token param `max_tokens`

UI/e2e tests that fill `settings-model-input` must now click `settings-add-model-button` if they expect the model to persist. `settings-model-input` is only the add-model draft input now. Default model selection is `settings-default-model-select`.

## Useful Checks

```bash
rg "baseUrl|defaultBaseUrlFor" src tests -n
rg "settings-model-input" tests -n
rg "ProviderConfig" tests -n
```

After tests compile, run formatter/check on touched files:

```bash
npx biome check src tests
```

Use `npx biome format --write ...` only if needed.

## Caveats

`src/storage/migrate.ts` was simplified because there is no release/backward compatibility requirement. It intentionally does not migrate the old single-provider shape.

No live provider calls were run.
