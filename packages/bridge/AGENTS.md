# `@live-ish/bridge`

What a server-backed demo needs from its own app: the frame runtime, hooks, a CSP helper and a per-frame session.

## Rules

- No dependencies. Any stack can use this, so it stays plain JavaScript with hand-written types.
- Keep the hooks contract: `window.demoHooks`, the same as a composed frame.

## Testing

- `pnpm --filter @live-ish/bridge test` runs the unit tests.
