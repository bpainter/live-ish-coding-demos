---
name: create-chrome-theme
description: Make a custom audience theme for a Live-ish deck, as a token file with no code. Use when the user wants a look no built-in theme has, such as their brand colors or a specific palette. Do not use to pick or switch to a theme that exists (use apply-chrome-theme), or to add a built-in theme to the engine (use add-chrome-theme in the Live-ish monorepo).
license: MIT
compatibility: Requires a Live-ish deck with schemaVersion 1.
metadata:
  live-ish-schema: "1"
---

# Create a chrome theme

Run `live-ish` through the deck's package manager, such as `pnpm live-ish check`.

1. Pick the base closest to the look. references/themes.md lists them. A dark theme starts best from a dark base, such as `high-contrast` or `phosphor`.
2. Run `live-ish theme new <id> --from <base> --json`. Read the path it prints. It writes `themes/<id>.json`, which takes whatever it leaves out from the base.
3. Run `live-ish themes --json` and read the base's `tokens`, so you use real token names. Run `live-ish schema` for the full shape in `.live-ish/schema/chrome-theme.json`.
4. Set only what must change in `tokens`, and update `name` and `traits`. A file allows no raw CSS, selectors or scripts.
5. Change the backdrop in three tokens together: `--chrome-backdrop`, `--chrome-backdrop-light` and `--chrome-backdrop-dark`.
6. In `deck.config.ts`, add the file and select it: `chrome: { theme: "<id>", custom: ["./themes/<id>.json"] }`.
7. Run `live-ish check --json`. `theme-contrast` prints each failing pair with its ratio and floor. Change the token until it passes. `live-ish explain theme-contrast` says more.

## Fonts

A font is a system stack or a file under `public/fonts/` with its license named. If the user does not name a font, keep the base's.

## Rules

- Use the public CLI and schema. Never write engine internals by hand.
- Run `live-ish check` before saying a task is done.
- Never state browser support without `live-ish support`.
- If `check` fails twice on the same issue, stop and report it.
