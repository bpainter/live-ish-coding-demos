# Changesets

Every pull request that changes a published package adds one file here. Run `pnpm changeset`, pick the packages and the bump, and write one sentence for the changelog.

All four packages share one version: `@live-ish/engine`, `@live-ish/verify`, `@live-ish/bridge` and `create-live-ish`. The `fixed` group in `config.json` keeps them together, and a test fails if they drift.

Pre-releases go to the `next` dist-tag. The steps are on the [release page](../docs/content/release.mdx).
