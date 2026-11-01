# Skills

The one source for agent skills. `live-ish skills sync` generates `.agents/skills/` and `.claude/skills/` from here. Never edit those copies.

```text
<name>/
  SKILL.md       portable frontmatter only: name, description, license, compatibility, metadata
  references/    one level deep
  claude.yaml    Claude-only frontmatter, merged into the .claude/skills copy
  openai.yaml    copied to agents/openai.yaml in the .agents/skills copy
  evals/
    triggers.json   prompts that should and should not trigger the skill
    golden.json     the golden task, its setup, and a scripted solution
```

`metadata.live-ish-audience: contributor` keeps a skill in the monorepo. Every other skill reaches every deck.

`references/themes.md` has no source file. The generator writes it from `packages/engine/themes/`.

Every skill follows four rules, and `pnpm test` holds each one to them:

- Use the public CLI and schema. Never write engine internals by hand.
- Run `live-ish check` before saying a task is done.
- Never state browser support without `live-ish support`.
- If `check` fails twice on the same issue, stop and report it.
