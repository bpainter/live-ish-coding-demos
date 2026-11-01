# @live-ish/bridge

What a server-backed Live-ish demo needs from its own app. No dependencies, and any stack can use it.

A frame with `kind: "server"` is your real app, on its own origin, driven step by step:

```ts
// deck.config.ts
hosts: { external: { shop: "http://localhost:4100" } },
servers: [{ app: "shop", command: "node shop/server.mjs", port: 4100 }],

// demos/<id>/demo.ts
frame: { app: "shop", path: "/products/1" },
```

`live-ish dev` and `live-ish present` start each server, with `PORT` and `LIVE_ISH_PRESENTER_ORIGIN` set, and stop it again. A port that already answers is left alone, so you can start a server by hand.

`examples/server` is a working deck, with a small Node app and no framework.

## In a Node server

```js
import { bridgeScript, frameHeaders, frameSession, runtimeTag } from "@live-ish/bridge";

// Every framed page: two headers, and this tag first in the <head>.
res.writeHead(200, { ...frameHeaders(), "Content-Type": "text/html" });
res.end(`<head>${runtimeTag()}</head>...`);

// Serve the tag's script at the address it names, /live-ish-bridge.js.
res.end(bridgeScript());
```

## In the page

```js
liveIsh.hooks({
  async reset() {
    liveIsh.startSession();
    await fetch(liveIsh.withSession("/reset"), { method: "POST" });
    return liveIsh.load();
  },
});
```

A step then calls it with `{ type: "hook", name: "reset" }`. This is the same `window.demoHooks` contract every frame has. A hook that changes what the server shows should end in `liveIsh.load()`: the deck resumes the step in the fresh document, and the page shows what the server rendered.

## In any other stack

Nothing here needs Node:

1. Serve `src/client.js` as a file, and load it with a `<script>` first in the `<head>`.
2. Send two CSP directives on every framed document:

   ```
   frame-ancestors <deck origin>; script-src 'self' 'unsafe-inline' <deck origin>
   ```

3. Read the session as below.

The deck names itself in `?presenter=<origin>` on the frame's first address, so a server never needs to know its port. `client.js` loads the frame runtime from there, so the runtime always matches the deck.

## The frame session

A deck can mount a hidden second frame beside the one on screen and replay it, so anything per visitor, such as a request log, has to be scoped per frame. A cookie alone can't do that, because two frames on one origin share it.

| Where | What | Why |
|---|---|---|
| `window.name` | The session id | It survives reloads and belongs to one frame. |
| `?s=<id>` | On requests the frame makes itself | `liveIsh.withSession(url)` adds it, and the bridge clears it from the address, because the runtime's digest includes the URL. |
| `live-ish-session` cookie | On requests the browser makes, such as a form post or a `navigate` step | The bridge stamps it just before the frame leaves. |
| `x-live-ish-session` header | Set by a proxy in front of the app | For a server that can't read the other two. |

`frameSession(request)` reads them in that order, from a Node request or a fetch `Request`. It returns an empty string for a frame's first request, marked `?mount=1`, and for any value that isn't an id.

## A stopped server

With an origin unset, or the app not running, the page shows its poster and a neutral note, and the browser sends no request to the dead origin. The deck's own server asks with a bare connection, so the app's request log never shows it. Start the app and press `r`, or move to the page again, to get the frame back.

## Deploying

Server frames are local by default. A deployed build leaves out any app at `localhost`, so a visitor's browser never asks their own machine, and those pages show posters. To put an app on a public host:

- Give it an address in `hosts.external`, and set `LIVE_ISH_PRESENTER_ORIGIN` on the app. The default only allows local decks.
- An in-memory log or cache is per instance. On a host that runs several instances, requests from one frame can land on different ones.
- The session cookie is `SameSite=Lax`, so it only reaches an app on the same site as the deck. On another site it is a third-party cookie, and browsers block it. Requests that carry `?s=` still work.

`PROTOCOL_VERSION` must match the engine's. A test in this package fails when they drift, and a frame that meets another version says so in its console.
