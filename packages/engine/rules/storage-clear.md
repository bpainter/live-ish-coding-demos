# storage-clear

**Fit.** A warning, and an error under `--strict`. `checks.rules` can relax it to `warn` or `off`.

Shown code calls `localStorage.clear()` or `sessionStorage.clear()`. On one origin a frame shares storage with the presenter, so this wipes the deck's own keys.

**Fix.** Remove the demo's keys one by one with `removeItem()`.
