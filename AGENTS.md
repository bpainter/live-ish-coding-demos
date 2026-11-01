# Live-ish contributor instructions

Live-ish makes scripted demos of code and UI, driven by a clicker. This pnpm monorepo publishes the engine and its tools. A deck takes them through npm and keeps a thin Next.js shell. The nearest `AGENTS.md` wins, so each package adds its own.

| Folder                 | What it is                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `packages/engine`      | `@live-ish/engine`: stage, presenter, reader, validators, the `live-ish` CLI, the shell, themes, skills |
| `packages/create`      | `create-live-ish`, the scaffolder. No runtime dependencies                                              |
| `packages/verify`      | `@live-ish/verify`: walks, axe, capture and perf. Optional, ships Playwright                            |
| `packages/bridge`      | `@live-ish/bridge`: what a server-backed demo needs from its own app. Optional                          |
| `examples/starter`     | The deck `create-live-ish` copies. It is also the API contract                                          |
| `examples/conformance` | One slide per layout, for the theme and layout checks                                                   |
| `examples/server`      | A deck that drives a real server, for the `server` frame kind                                           |
| `parity/`              | The parity matrix: each capability and the check that proves it                                         |
| `docs/decisions.md`    | Why things are the way they are. Append only, one entry per decision                                    |

## Commands

- `pnpm install` once per checkout.
- `pnpm test` runs the unit tests. It stays under a minute with no browser.
- `pnpm typecheck` and `pnpm lint` must pass before a commit.
- `pnpm scan:private` must pass before a commit. The pre-commit hook runs it.
- `pnpm build` builds the starter. `pnpm smoke` drives it in a browser.
- `pnpm live-ish <command>` runs the CLI from this checkout.
- `pnpm live-ish skills sync` regenerates `.agents/skills/` and `.claude/skills/`. Add `--check` to fail on any difference.
- `pnpm skills:ref` runs the pinned `skills-ref` validator. It needs `pipx` or `uvx`.
- `pnpm skills:fresh` scaffolds real decks from a packed engine and runs the agent files through them. It takes a minute or two.
- `pnpm gen:themes` rebuilds everything derived from the theme files.

After changing an example's shell or config, delete its `.next` first. Stale `.next/dev/types` breaks `tsc`.

## Code style

- TypeScript strict. Few dependencies, exact versions. A new dependency needs a stated reason.
- Tests use `node:test`. No other test framework.
- CSS uses semantic BEM-like class names built with Tailwind `@apply`. No utility classes in JSX. The engine ships compiled CSS, so a deck needs no Tailwind.
- Public words everywhere: beats `before` and `after`, frame kind `server`, `Demo`, `title`, `--chrome-*` for audience chrome, `--speaker-*` for the presenter, `--deck-*` for copy slides.
- Keep comments that explain why. Every timing and guard in stage code exists for a recorded bug, so read the comment before changing one.
- A reader must never meet a reference to a private document.

## Generated files

Never edit these by hand. Edit the source and regenerate.

| Generated                                                          | Source                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `.agents/skills/`, `.claude/skills/`                               | `packages/engine/skills/`, through `pnpm live-ish skills sync`      |
| `examples/*/app/`, `next.config.ts`, `tsconfig.json`, `.gitignore` | `packages/engine/shell/`, through `live-ish upgrade` in the example |
| `packages/engine/assets/chrome/`, `docs/generated/`                | `packages/engine/themes/`, through `pnpm gen:themes`                |

## Testing

- Every validator rule has a broken fixture, a tier and a docs page. A rule without them fails the tests.
- Every skill has trigger prompts and a golden task in `evals/`. `pnpm test` runs its commands on a fresh starter, with no agent.
- `pnpm evals:claude` prints the trigger prompts and golden tasks. `--run` runs them in Claude Code. That spends API money, so nothing runs it on a PR.

## Security

- Exit codes and `--json` shapes are public API: 0 pass, 1 findings, 2 misuse, 3 environment. `--json` prints one document to stdout.
- Browser support comes from `web-features` through `live-ish support`. Never state it from memory.
- A public repo holds nothing personal: no talk content, no local paths, no private tooling. Never weaken `scripts/scan/`.

## Commits

Conventional Commits 1.0.0, signed off with `git commit -s`. Hooks enforce both. Never bypass a hook.
