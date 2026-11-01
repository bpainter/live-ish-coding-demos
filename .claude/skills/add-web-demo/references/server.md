# Server-backed demos

Use this when the point of the demo is real server behavior: its routes, logs or caching. A page that only fetches a little data does not need it.

`live-ish new web-demo <id> --server --json` writes a working example with one route and one hook, and it edits `deck.config.ts` for you:

- `kind: "server"` and `beats: "single"` in `demos/<id>/demo.ts`.
- `frame: { app: "<id>", path: "/" }` on the page.
- An entry in `servers`, with the command and a free port.
- The address in `hosts.external`.

If the deck does not have `@live-ish/bridge`, the command installs it first. A failed install exits 3 and writes nothing.

Read `demos/<id>/single/server.mjs` and `page.html`. The bridge gives them everything a frame needs: the content security policy, the frame runtime and the hook. Any stack can replace them, as long as it keeps those three. The bridge's README shows how with no Node.

`--server` and `--static` exclude each other.

## Running it

- `live-ish dev` and `live-ish present` start each entry in `servers`, and stop it when they stop.
- With the server stopped, the page shows its poster and a note. No request goes to a dead address.
- A deployed deck does not start servers. Deploying one is a manual step, so ask the user before planning on it.

## Steps

Steps work as on any page. A `hook` action calls a function on `window.demoHooks` in the app's page, and `assert` checks the result:

```ts
actions: [
  { type: "hook", name: "ask" },
  { type: "assert", target: "#answer", expect: "text~=Hello" },
],
```

List the hook in the page's `hooks`. The check cannot read a server's pages, so test the steps by pressing through them in `pnpm dev`.
