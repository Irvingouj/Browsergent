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
  references/   (optional)
  scripts/      (optional)
```

## SKILL.md template

```yaml
---
name: my-skill
description: One line describing when to use this skill.
disable-model-invocation: false
---

# My Skill

Instructions for the browser agent…
```

## Rules

- Skill names: lowercase letters, digits, hyphens only.
- Browsergent agent tools: `run_js`, `get_doc`, `load_skill` only.
- Do not assume bash, repo access, or IDE tools unless user confirms.
- User skills live under `/skills/user/`; bundled skills under `/skills/bundled/` are seeded by the extension.

## User request

$ARGUMENTS
