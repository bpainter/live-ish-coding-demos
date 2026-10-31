# theme-lint

**Fit.** A warning, and an error under `--strict`. `checks.rules` can relax it to `warn` or `off`.

Frame theme CSS steps outside its layers. A theme paints around shown code, so it must never win against it or use the features a demo is there to show.

**Fix.** Keep rules in `@layer frame-theme` or `@layer frame-layout`, with paint properties only on feature elements.
