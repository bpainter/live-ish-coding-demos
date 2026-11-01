# Contributing

Thank you for reading this. Live-ish has one maintainer, so a clear pull request gets a faster answer than a large one.

## What gets accepted

- Bug fixes with a test or a conformance page. A bug in the engine gets a page in `examples/conformance`.
- Docs fixes of any size.
- Features that serve a talk where the demo is the point. Open an issue first. "No" is a normal answer. See [GOVERNANCE.md](GOVERNANCE.md).

Questions and show and tell go in GitHub Discussions, so issues stay actionable.

## Set up

You need Node 22 or later. The repo pins pnpm through `packageManager`, so Corepack fetches the right version.

```sh
corepack enable
pnpm install
git config core.hooksPath .githooks
```

The hooks run `pnpm scan:private` before each commit and check the commit message.

## Run the tests

| Command                  | What it does                                                  |
| ------------------------ | ------------------------------------------------------------- |
| `pnpm test`              | Units, with no browser, in about a minute.                    |
| `pnpm typecheck`         | Every package and example.                                    |
| `pnpm lint`              | ESLint.                                                       |
| `pnpm format:check`      | Prettier.                                                     |
| `pnpm scan:private`      | The deny list and the binary allow-list.                      |
| `pnpm test:e2e`          | Builds the starter and walks it in Chromium.                  |
| `pnpm --filter docs dev` | The docs site, with a live copy of the starter, on port 3100. |

CI runs all of these and more. The [contributing page](docs/content/contributing.mdx) lists every job.

## Make a change

1. Branch from `main`.
2. Make the change, with a test.
3. Run `pnpm changeset` if a published package changed. All four packages share one version.
4. Sign off each commit with `git commit -s`. This is the [Developer Certificate of Origin](https://developercertificate.org/). There is no contributor license agreement.
5. Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
6. Open a pull request and fill in the template.

## House rules

- All CSS uses semantic class names, built with Tailwind `@apply`. No utility classes in JSX.
- Tests use `node:test`. Do not add a test framework.
- Exact versions. A new dependency needs a reason in the pull request: check its maintainers, install scripts and transitive size.
- Docs use sentence case headings and plain direct sentences, with no em or en dashes and no exclamation marks. Each page opens with what the reader will have when done.
- A change to a guarantee needs a changelog entry. A loosened guarantee is a breaking change.

## Dependency updates

Dependabot opens one grouped pull request a month, with a three-day cooldown. pnpm holds any version younger than three days (`minimumReleaseAge: 4320`), so the two agree.

Build scripts are denied by default. pnpm stops an install at any package that has one and is not listed under `permissions` in `pnpm-workspace.yaml`. To add an entry, run `pnpm permissions list`, read the script, and say in the pull request why it must run or why it can stay off.

### Urgent dependency fixes

A security fix can land before its three days are up. This is the only path around the hold:

1. Confirm the advisory in the GitHub Advisory Database, and confirm that the fixed version comes from the expected maintainer and has provenance where the package offers it.
2. Add the package and version to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`, with a comment naming the advisory.
3. Open a pull request titled `fix(deps): <package> for <advisory id>`. CI runs in full.
4. Remove the exclusion in the next monthly update.

Build scripts stay denied on this path too.
