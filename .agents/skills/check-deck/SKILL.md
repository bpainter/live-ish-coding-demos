---
name: check-deck
description: Run the checks on a Live-ish deck, explain what they report, and fix what is safe to fix. Use when the user asks whether a deck is ready, reports something broken, or pastes a finding or rule id such as selector or terminal-range. Do not use to add new slides (use add-copy-slide, add-web-demo or add-terminal-demo), or to update the engine (use upgrade-deck).
license: MIT
compatibility: Requires a Live-ish deck with schemaVersion 1.
metadata:
  live-ish-schema: "1"
---

# Check a deck

Run `live-ish` through the deck's package manager, such as `pnpm live-ish check`.

1. Run `live-ish check --json`. Exit 0 passes, 1 means findings, 2 misuse, 3 environment. `live-ish check <id> --json` limits the run to one demo, page or slide.
2. Read `findings`. Each has `rule`, `severity`, `where`, `message`, a `fix` and `docs`.
3. Run `live-ish explain <rule>` for any rule you do not know. It works offline.
4. Fix errors first, then warnings, using the table below.
5. Run `live-ish check --json` again. Repeat until it exits 0.
6. Tell the user what you fixed, and list what you left for them.

Before a talk, run `live-ish check --strict --json`, which raises fit warnings to errors. `live-ish doctor --json` checks the machine.

## What is safe to fix

| Finding | Do |
|---|---|
| `selector`, `code`, `excerpt`, `files`, `flags`, `hook`, `terminal-range` | Fix it. The file and the message say how. A `selector` finding lists the ids found |
| `file-size`, `step-cap`, `key-step`, `callouts`, `bullets`, `meter` | Fix it, keeping what the slide says |
| `shell` | Stop and ask. The author edited a generated file, or the engine moved on. `live-ish upgrade` may fix it |
| `skills-stale` | Tell the user. `upgrade-deck` covers it |
| `support`, `support-claim` | Run `live-ish support "<feature>" --json` and use real data. Never type a version from memory |
| `terminal-token` | Stop. Tell the user a credential may be in a recording |
| `todo`, or anything in the notes | Ask. Speaker notes are the author's words |
| `theme-contrast` | Change the token named in the message |

Never silence a rule through `checks.rules` unless the user asks. Never edit `app/`, `next.config.ts`, `.live-ish/` or `node_modules/` to make a finding go away.

## Rules

- Use the public CLI and schema. Never write engine internals by hand.
- Run `live-ish check` before saying a task is done.
- Never state browser support without `live-ish support`.
- If `check` fails twice on the same issue, stop and report it.
