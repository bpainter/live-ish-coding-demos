---
name: add-chrome-theme
description: Add a built-in audience theme to the Live-ish engine, with its JSON file, contrast run, conformance run and docs. Use when a contributor working in the Live-ish monorepo wants a new theme to ship with the engine. Do not use in a deck, where a custom theme is a token file (use create-chrome-theme), or to change a deck's theme (use apply-chrome-theme).
license: MIT
compatibility: Requires a checkout of the Live-ish monorepo.
metadata:
  live-ish-schema: "1"
  live-ish-audience: contributor
---

# Add a built-in chrome theme

1. Add `packages/engine/themes/<id>.json`. Copy the shape of the closest theme. The id and the name stay neutral: no brand, product or person. A font must already be in `FONT_FAMILIES`, or be a system stack.
2. Run `pnpm gen:themes`. It writes the CSS, the id list, the schema enum and the docs table.
3. Update the theme count in `packages/engine/test/themes.test.ts`.
4. Run `pnpm test:contrast`. The theme must meet every floor: 4.5:1 for text on both backdrop extremes, 7:1 for code tokens, on highlighted lines too, and 3:1 for accent and ring.
5. Add the theme to the conformance deck, and run `pnpm build:conformance`.
6. Run `pnpm live-ish skills sync`, so the theme skills list the theme.
7. Run `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm scan:private`.
8. Note the decision in `docs/decisions.md` if the theme needed anything new.

A theme that fails a floor does not ship. An effect is engine code named by `motion.effect`, so a theme file cannot add its own.

## Rules

- Use the public CLI and schema. Never write engine internals by hand.
- Run `live-ish check` before saying a task is done.
- Never state browser support without `live-ish support`.
- If `check` fails twice on the same issue, stop and report it.
