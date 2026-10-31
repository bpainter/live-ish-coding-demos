# presenter-public

Tier: Fit. Warns, and fails under `--strict`.

The deck sets `presenter.onHost: true`, so a deployed host serves `/present` and `/speaker`. Your speaker notes are public at those addresses.

## Fix

Remove `presenter.onHost` to keep notes out of the deployed build. Keep it only if you want to present from the deployed host, and your notes hold nothing private.
