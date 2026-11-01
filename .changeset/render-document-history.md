---
"@live-ish/engine": patch
"@live-ish/verify": patch
---

A link pressed in hands-on mode counts as a frame's own entry again in Chrome, which now loses a `window.name` write made during `pagehide`. The stage blurs a focused frame before it takes focus back, for Firefox. `@live-ish/verify` moves to Playwright 1.64.1, whose Chrome no longer switches off the behavior that hid this.
