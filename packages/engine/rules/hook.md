# hook

**Integrity.** Always on, always an error, and it cannot be turned off.

A page calls a hook that its scripts do not define, so the frame stops with `hook-missing` on stage.

**Fix.** Define it in `hooks.js`: `window.demoHooks = { reset() {} }`. The check reads the file without running it, so a hook built in a way it cannot follow is skipped, not reported.
