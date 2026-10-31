# skills-stale

**Fit.** A warning, and an error under `--strict`. `checks.rules` can relax it to `warn` or `off`.

Agent skills target an older schema than this engine. The check reads `.live-ish/skills.lock` and passes when there is none.

**Fix.** Run `live-ish upgrade`.
