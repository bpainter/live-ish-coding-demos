---
name: add-validator-rule
description: Add a validator rule to the Live-ish engine, with its tier, its broken fixture and its error page. Use when a contributor working in the Live-ish monorepo wants live-ish check to catch a new mistake. Do not use in a deck, or to fix what a rule reports (use check-deck).
license: MIT
compatibility: Requires a checkout of the Live-ish monorepo.
metadata:
  live-ish-schema: "1"
  live-ish-audience: contributor
---

# Add a validator rule

1. Pick the tier in `packages/engine/src/lib/validate/catalog.ts`. Integrity means the demo breaks on stage, and it can never be turned off. Fit means the layout overflows, a claim has no source, or a generated file is stale. Support runs only with `support` or an intro. Style is taste, off by default. Add the id to that list.
2. Write the rule with `defineRule` in the group that fits under `packages/engine/src/lib/validate/rules/`. A rule that cannot see everything stays quiet, because a false Integrity error has no way out.
3. Every finding names where it is, what is wrong in words, and a one-line fix.
4. Add a broken fixture to `CASES` in `packages/engine/test/validate-rules.test.ts`: `c("<id>", "<what breaks>", (f) => ...)`.
5. Write `packages/engine/rules/<id>.md`, in the shape of its neighbors: the tier line, what it catches, and the fix. `live-ish explain <id>` prints that page offline.
6. Run `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm scan:private`.
7. Run `live-ish check` on the starter. A new rule must not fire on a clean deck. `pnpm --filter starter exec live-ish check` does that.

## Rules

- Use the public CLI and schema. Never write engine internals by hand.
- Run `live-ish check` before saying a task is done.
- Never state browser support without `live-ish support`.
- If `check` fails twice on the same issue, stop and report it.
