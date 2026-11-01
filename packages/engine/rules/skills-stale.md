# skills-stale

**Fit.** A warning, and an error under `--strict`. `checks.rules` can relax it to `warn` or `off`.

Agent skills target an older schema than this engine, or differ from what it ships. The check reads `.live-ish/skills.lock` and passes when there is none. A skill you deleted is fine, and nothing needs agent files at all.

**Fix.** Run `live-ish upgrade`. It refreshes every file you did not edit. For a file you edited, the new version lands in `.live-ish/skills-incoming/<name>/`, so you can compare the two. `live-ish skills sync --force` restores everything, or relax the rule in `checks.rules` to keep your edit.
