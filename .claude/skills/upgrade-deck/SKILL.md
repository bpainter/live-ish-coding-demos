---
name: upgrade-deck
description: Update a Live-ish deck to a newer engine, with its shell and skills. Use only when the user explicitly runs this skill or asks to upgrade the engine. Do not use to fix a finding (use check-deck), or as a step in any other task, because it changes dependencies and generated files.
license: MIT
compatibility: Requires a Live-ish deck with schemaVersion 1.
metadata:
  live-ish-schema: "1"
disable-model-invocation: true
---

# Upgrade a deck

Run `live-ish` through the deck's package manager, such as `pnpm live-ish check`.

1. Ask the user to commit first, so the upgrade is one diff they can read.
2. Run `live-ish check --json` and note what it reports today.
3. Update the package with the deck's manager, such as `pnpm up @live-ish/engine --latest`. Update `@live-ish/verify` to the same version if the deck has it.
4. Run `live-ish upgrade --json`.
5. If it stops with `edited`, the author changed a generated shell file. Show the list and stop. Run `live-ish upgrade --force` only when the user says to, since it overwrites those files.
6. Read `agents` in the output. For each entry in `kept`, the author edited a skill, so its new version waits at `incoming`. Show the user both and let them choose. `deleted` lists skills the author removed, which stay removed.
7. Run `live-ish check --json`. Fix each issue it reports, and compare with step 2.
8. Run `live-ish skills sync --check`. It lists any skill still differing from the engine, which is expected for a file the author kept.
9. Tell the user what changed, and that the upgrade wrote nothing under `slides/` or `demos/` unless a schema codemod says so.

## Rules

- Use the public CLI and schema. Never write engine internals by hand.
- Run `live-ish check` before saying a task is done.
- Never state browser support without `live-ish support`.
- If `check` fails twice on the same issue, stop and report it.
