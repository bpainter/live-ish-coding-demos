# selector

**Integrity.** Always on, always an error, and it cannot be turned off.

A selector in a step matches nothing in the demo's own files. On stage this is a spotlight that never appears, or an action that stops the demo.

**Fix.** Use a selector from the `Found:` line, which lists the nearest ids in the file. If a script creates the element at runtime, the file cannot show it, so add the selector to the beat's `runtimeSelectors` in `demo.ts`.
