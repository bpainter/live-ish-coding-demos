# `create-live-ish`

The scaffolder behind `pnpm create live-ish`. It copies the starter, installs, then asks the installed engine to write the shell and agent files, so what lands always matches that engine.

## Rules

- No runtime dependencies. This runs before anything is installed.
- `bin/create-live-ish.mjs` is plain JavaScript, with the Node version check first.
- `template/` is generated at pack time by `scripts/bundle-starter.mjs` and git-ignored. Edit `examples/starter` instead.
- Exit codes match `live-ish`: 2 misuse, 3 environment.
- `--no-agents` skips `AGENTS.md`, `CLAUDE.md` and skills. `live-ish add agents` adds them later.

## Testing

Pack the engine, then scaffold from the tarball with `--engine`, since nothing is on the registry until a release:

```sh
node packages/create/scripts/bundle-starter.mjs
node packages/create/bin/create-live-ish.mjs <folder> --engine file:<tarball>
```
