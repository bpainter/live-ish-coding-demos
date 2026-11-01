---
name: prepare-release
description: Walk the Live-ish release runbook up to the human approval. Use only when a maintainer explicitly runs this skill or asks to prepare a release. Do not use for an ordinary commit or pull request, or as a step in any other task, because it starts a publish.
license: MIT
compatibility: Requires a checkout of the Live-ish monorepo.
metadata:
  live-ish-schema: "1"
  live-ish-audience: contributor
---

# Prepare a release

Stop at the human approval. An agent never approves a publish, and no token exists to do it with.

1. Confirm the branch is `main`, clean, and up to date.
2. Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm scan:private`, `pnpm build` and `pnpm skills:ref`. Stop on any failure.
3. Run `pnpm live-ish skills sync --check` and `pnpm gen:themes --check`. Generated files must match their sources.
4. Confirm all four packages share one version: `@live-ish/engine`, `@live-ish/verify`, `@live-ish/bridge` and `create-live-ish`.
5. Read `CHANGELOG.md`. Each breaking change needs an entry and, where possible, a codemod in `packages/engine/src/cli/commands/maintain.ts`. If the public schema moved, bump `live-ish-schema` in every skill.
6. Show the maintainer the "Version packages" pull request. They merge it.
7. Once merged, show the tag command. They tag on `main`. The `publish` workflow then waits for environment approval, runs everything once more and stages the packages.
8. List what the maintainer does next, and stop:
   - Run `npm stage view`, read the tarball list, and check it against `pnpm scan:private`.
   - Approve with 2FA.
   - From a clean machine, run `pnpm create live-ish`, `pnpm dev` and one walk.
   - Publish the GitHub release from the changelog.

Never run `npm publish` or `npm stage approve`. Check these npm features against current docs before relying on them.

## Rules

- Use the public CLI and schema. Never write engine internals by hand.
- Run `live-ish check` before saying a task is done.
- Never state browser support without `live-ish support`.
- If `check` fails twice on the same issue, stop and report it.
