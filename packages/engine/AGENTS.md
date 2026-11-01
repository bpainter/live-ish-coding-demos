# `@live-ish/engine`

The stage, presenter, reader, frame composer, runtime, validators and the `live-ish` CLI. A deck consumes this package's TypeScript source through `transpilePackages`.

## Layout

- `src/cli/` is the CLI. `src/cli/main.ts` lists every command. No CLI framework.
- `src/lib/validate/` holds the validators. Each rule group is one module under `rules/`, and `catalog.ts` names every rule and its tier.
- `src/lib/skills.ts` generates agent skills. `src/cli/commands/skills.ts` is the command.
- `src/prepare/` writes `.live-ish/` in a deck. Only `src/lib/content.ts` imports `@live-ish/deck`.
- `skills/<name>/` is the one source for agent skills. `shell/` holds the deck's generated files. `templates/` holds what `live-ish new` copies.
- `rules/<id>.md` is the page `live-ish explain` prints, offline.
- `themes/<id>.json` is one built-in theme. Everything else about a theme is generated from it.

## Commands

- `pnpm --filter @live-ish/engine test` runs `test/*.test.ts`.
- `pnpm --filter @live-ish/engine test:contrast` runs the theme contrast floors.
- `pnpm --filter @live-ish/engine typecheck` and `lint`.
- `pnpm --filter @live-ish/engine build` compiles `dist/engine.css` and `dist/schema/`.

## Code style

- All paths go through `src/lib/paths.ts`, rooted at the deck. Never read `process.cwd()` elsewhere.
- CSS lives in `styles/` with `@apply`. Components use semantic class names, and the lint rule rejects utilities.
- Keep `export const dynamic = "force-dynamic"` literal in shell files: Next reads it statically.
- A new CLI command goes in `COMMANDS` in `src/cli/main.ts`, with a usage line. A skill may name only what `live-ish --help` lists, and a test holds it to that.

## Testing

- A new rule: add it to `catalog.ts`, write it in a group, add a broken fixture to `test/validate-rules.test.ts`, and write `rules/<id>.md`.
- A new action type: `src/cli/commands/reference.ts` fails to compile until it lists the type.
- A changed skill: run `pnpm live-ish skills sync` at the repo root, and commit the generated copies with the source.

## Security

- `live-ish build` reads a finished build back and fails if a speaker note is in it. Keep that check.
- `record` and the `terminal-token` rule share one token scan in `src/lib/recording.ts`.
