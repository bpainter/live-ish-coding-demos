# third-party-script

Tier: Fit. Warns, and fails under `--strict`.

Shown code loads a script from another host. With one origin, a frame shares the presenter's origin, so that script could read the presenter's page.

## Fix

Serve the script from the demo folder, or set `hosts.frames` so frames run on their own origin.
