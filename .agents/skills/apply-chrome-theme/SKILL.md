---
name: apply-chrome-theme
description: Choose an audience theme for a Live-ish deck, demo, beat or page, and apply it. Use when the user wants demo slides to look different, names a theme such as glass, flat or early web, or asks what themes exist. Do not use to design a new theme from scratch (use create-chrome-theme) or to restyle copy slides, which use the deck theme and not these.
license: MIT
compatibility: Requires a Live-ish deck with schemaVersion 1.
metadata:
  live-ish-schema: "1"
---

# Apply a chrome theme

Run `live-ish` through the deck's package manager, such as `pnpm live-ish check`.

1. Run `live-ish themes --json`. It lists every theme id and its traits, including the deck's custom themes. references/themes.md describes the built-in ones.
2. Pick the id that fits. If the user described a look and two themes fit, name both and ask.
3. Set it at the level the user asked for, from the table below. Use exact ids, such as `early-web`.
4. Run `live-ish check --json`. Fix each issue it reports.
5. Tell the user they can preview any built-in theme by adding `?chrome=<id>` to a slide's address in `pnpm dev`.

## Where a theme goes

Highest wins: page, beat default, demo, deck.

| Scope | File | Field |
|---|---|---|
| The whole deck | `deck.config.ts` | `chrome: { theme: "flat" }` |
| Every before or after beat | `deck.config.ts` | `chrome: { theme: "glass", beats: { before: "early-web" } }` |
| One demo | `demos/<id>/demo.ts` | `chrome: "flat"` at the top level |
| One page of a demo | `demos/<id>/demo.ts` | `before: { chrome: "early-web", ... }` |

A different theme per beat is an easy way to make a point: the old way in `early-web`, the new way in `glass`.

Copy slides keep the deck theme. These themes reach demo slides only.

## Rules

- Use the public CLI and schema. Never write engine internals by hand.
- Run `live-ish check` before saying a task is done.
- Never state browser support without `live-ish support`.
- If `check` fails twice on the same issue, stop and report it.
