# `@live-ish/verify`

Walks, accessibility scans, capture, warm-up and performance checks for decks. It is optional, because it brings Playwright. The engine's CLI delegates `walk`, `axe`, `capture`, `og`, `warmup`, `perf` and `parity` to this package, and a deck installs it with `live-ish add verify`.

## Rules

- Commands exit with the public codes: 0 pass, 1 findings, 2 misuse, 3 environment.
- `--json` prints one versioned document to stdout. Progress goes to stderr.
- Walks read the same selectors a deck ships: `.notes__step`, `.notes__play`, `.speaker__controls`, `.page-frame__iframe`.
- Presenter state lives at `live-ish:<deck>:state`.

## Testing

- `pnpm --filter @live-ish/verify test` runs the unit tests, with no browser.
- `pnpm --filter @live-ish/verify typecheck`.
