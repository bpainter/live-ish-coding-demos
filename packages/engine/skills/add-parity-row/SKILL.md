---
name: add-parity-row
description: Add a row to the Live-ish parity matrix, with the check that proves it. Use when a contributor working in the Live-ish monorepo adds a capability that needs tracking, or finds a capability the matrix does not list. Do not use in a deck, or to add a validator rule (use add-validator-rule).
license: MIT
compatibility: Requires a checkout of the Live-ish monorepo.
metadata:
  live-ish-schema: "1"
  live-ish-audience: contributor
---

# Add a parity row

A capability is at parity when the matrix has a row for it, a named check proves it, the behavior is reachable from public config or the CLI, and its docs exist.

1. Open `parity/matrix.json`. Find the group the capability belongs to.
2. Add a row with the next id in that group: `id`, `group`, `capability`, `target`, `phase` and `check`. `phase` is `v0.1`, `beta` or `v1.0`.
3. Name a check that exists. Every row needs one, and a row with none fails the tests. If no check proves the capability, write that check first, in `packages/verify`, and set the row's `suite` to it.
4. Regenerate the rendered table with the script beside the matrix.
5. Run `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm scan:private`.

A row leaves parity only as a listed exception the repository owner approved. Never drop a row to make a run pass. A row names a capability, never one deck's slides or demos.

## Rules

- Use the public CLI and schema. Never write engine internals by hand.
- Run `live-ish check` before saying a task is done.
- Never state browser support without `live-ish support`.
- If `check` fails twice on the same issue, stop and report it.
