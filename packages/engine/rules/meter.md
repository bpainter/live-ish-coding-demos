# meter

**Fit.** A warning, and an error under `--strict`. `checks.rules` can relax it to `warn` or `off`.

A meter is on the wrong step, a page has more than one, or `meter.value` disagrees with the count. A `meter.source` such as `before/*.js` is counted from the files.

**Fix.** Use the computed value in the message, and put a before meter on the last step.
