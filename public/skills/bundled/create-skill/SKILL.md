---
name: create-skill
description: Guides creating a new user skill under /skills/user/ in Browsergent OPFS using the agentskills.io layout.
---

# Create Skill

Help the user author a Browsergent skill stored in OPFS.

## Target layout

```text
/skills/user/{skill-name}/
  SKILL.md
  references/
    {action}.js
```

Create `references/*.js` by default for repeatable browser automation. Use a prose-only skill only when the work is judgment-heavy and cannot reasonably be scripted.

## SKILL.md template

```yaml
---
name: my-skill
description: One line describing when to use this skill.
disable-model-invocation: false
---

# My Skill

When this workflow matches the user task, run the bundled script instead of rewriting inline JS:

run_js({
  file: { name: "/skills/user/my-skill/references/action.js" },
  params: { ... }
})

## Bundled scripts

- `references/action.js` — what it does. Params: `{ ... }`.
```

## Script rules

- Read inputs from `globalThis._params`.
- Start scripts with `const p = globalThis._params ?? {};`.
- Do not hardcode user-specific values or string-interpolate params into generated JS.
- Log meaningful steps and final results with `console.log`.
- Keep scripts self-contained; each extension-js cell is isolated.
- Call `get_doc` before using unfamiliar `page.*`, `web.*`, `fs.*`, `chrome.*`, or `sidepanel.*` APIs.
- Prefer executing an existing `references/*.js` script with `run_js({ file, params })` over generating equivalent inline `run_js` code.

## Rules

- Skill names: lowercase letters, digits, hyphens only.
- Browsergent agent tools: `run_js`, `get_doc`, `load_skill` only.
- Do not assume bash, repo access, or IDE tools unless user confirms.
- User skills live under `/skills/user/`; bundled skills under `/skills/bundled/` are seeded by the extension.
- Browsergent's `run_js` wrapper reads OPFS text files and injects `params` as `globalThis._params` before passing code to extension-js.

## User request

$ARGUMENTS
