# Decisions

Append only. One short entry per decision. Newest last.

## Hosting

**What counts as deployed.** `src/next/hosting.cjs` decides once, when `next.config.ts` loads. `LIVE_ISH_TARGET` wins: `live-ish build` sets `deployed`, `live-ish present` sets `local`. Without it, `next dev` is local, and `next build` is deployed only when a provider's own variable is set (`VERCEL`, `NETLIFY`, `CF_PAGES`, `RENDER`, `RAILWAY_ENVIRONMENT_NAME`). A plain `next build` anywhere else stays local, with the presenter and notes in it, and prints one line saying so when the deck names a site. `next start` on a server with no provider variable therefore needs `live-ish build`. `LIVE_ISH_TARGET` is internal, as `NEXT_DIST_DIR` is, and is not one of the documented overrides.

**The mode is separate from the target.** Mode comes from origins, target from where the build runs, so a one-origin build can be made and walked on a laptop with its presenter. `LIVE_ISH_SITE_ORIGIN` and `LIVE_ISH_FRAMES_ORIGIN` count everywhere. `hosts.frames` in the config counts only when deployed, or `live-ish present` would need the network.

**Pages left out of the build.** The presenter's shell files are `page.presenter.tsx` and `layout.presenter.tsx`. `withDeck()` lists `presenter.tsx` in `pageExtensions` only when the build serves the presenter. Leaving it out removes the routes, their chunks and their payloads, which a `notFound()` or an empty `generateStaticParams` would not. `/present` and `/speaker` are then plain 404s. `live-ish upgrade` and `doctor` must treat these as the shell's file names.

**Notes in no payload.** The deck module imports `demo.ts` and every slide, so notes reach every server chunk through `lib/content.ts`, reader pages included. A deployed build that keeps no notes gets a `.live-ish/deck.gen.ts` holding the deck as data, with `notes`, `cautions` and `ifKeyboard` removed. `routes.ts` stays an import. Deck data with a function or a RegExp in it stops the build. `live-ish build` reads the finished build back and fails if any note is in it, which catches a `routes.ts` importing its `demo.ts`. Notes stay when `presenter.onHost` or `reader.notes` is set: they are public then, and they are also in the reader pages' payloads.

**Descriptions with no notes.** A walk page's description comes from its notes, so a public build falls back to the demo's intro description, then its scenario.

**`demo.ts` in no function.** Trace includes are listed file by file, leaving out `demo.ts`. Turbopack's includes win over `outputFileTracingExcludes`, and its globs have no negation.

**Frames send `no-referrer`.** Next applies `next.config` headers over a route handler's, so `/:path*` overwrote the handler's value on every frame document. The frame rules now come after the general rule, by path, and cover declared addresses. `X-Robots-Tag` goes the same way, with a host rule only where frames have a host of their own.

**History depth.** With the policy fixed, `document.referrer` is empty on every load, and the runtime's check for a frame's own load never passed. A multi-page document now writes its count to `window.name` on `pagehide`, so a named load is one the frame made itself. The runtime no longer reads the referrer.

**No host in a one-origin frame.** Local builds and one-host builds inline no origin in client code. On one origin the CSP uses `'self'` for every source, and `<meta name="presenter-origin">` says `self`. A proxy that rewrites `host` cannot blank a frame, so `host` and `x-forwarded-proto` only matter across origins. `LIVE_ISH_SITE` is inlined in server code only, for canonical URLs. A local build with no site writes no canonical URL and uses relative JSON-LD ids.

**Storage keys.** Everything is `live-ish:<deck>:<name>`, where `<deck>` is a slug of the title. `state`, `notes-size`, `rehearsal-log`, `text-view`, `glass`, `sync:<build>` for the channel and `builds`. Tools that read `deck:state`, such as the ported walks, must read `live-ish:<deck>:state`. `.live-ish/deck.json` has `deckId`.

**Different builds.** The sync channel keeps the build in its name, so builds cannot drive each other. A second channel, `live-ish:<deck>:builds`, carries only the build ID, so the "No audience" pill can name both.

**Analytics.** No `@vercel/*` package, at any level. Vercel's two scripts are plain `<script>` tags at paths the platform serves, so the adapter loads them by address. The addresses live in the server layout and reach `SiteAnalytics` as props, so a default build has no `_vercel` in `.next/static`. Analytics load on `/` and `/s/<id>` only, on deployed builds only, and never with `navigator.webdriver` or `?capture=1`. `analytics.script` becomes a lazy import in `.live-ish/analytics.gen.ts`, aliased as `@live-ish/analytics`. Its default export runs once.

**Provider presets.** `withDeck({ provider })` defaults to the provider detected from the environment. Vercel has the full preset: `Vercel-CDN-Cache-Control` on build files, the commit SHA, and the site from `VERCEL_PROJECT_PRODUCTION_URL`, which satisfies the `hosts.site` guard. The others only detect and read their commit. A Vercel preview stays out of search, and on two hosts it shows posters, because the frames host names production in `frame-ancestors`.

**Reader switches.** `reader.enabled: false` turns `/` and `/s/<id>` into 404s and closes `robots.txt`. `reader.index: false` closes `robots.txt`, empties the sitemap and adds `noindex`.

**Stopping `live-ish present`.** `bin/live-ish.mjs` spawns the CLI asynchronously and forwards SIGINT and SIGTERM. With `spawnSync`, a SIGTERM killed the shim and left `next start` holding the port.

**S-2 passed: one host stays the deployed default.** `scripts/hosting.mts`, on the starter plus a temporary multi-page demo, in Chromium 145 and WebKit 26.0 (Playwright builds). One host and two local origins gave the same result in both browsers: 80 of 80 checks, 20 of 20 step digests equal, 0 differences. The S-2 fallback was not needed. Two named origins passed 79 of 79 in both browsers, without the moved-port check, because two hosts name their port at build.

Covered: every stop forward and back with digests and highlights, Next during playback and into a document load, the last step by key and by the speaker's button, presses with focus in the frame and while an intro's frame warms, 29 key checks, a cleared store followed by a press and a reload, Back and Forward in a multi-page demo after a replay, a link pressed by hand in hands-on mode, and the same build on a second port. Rows 7 and 8 passed in WebKit on both origin setups: focus asserts replay, and Back has its entry. With the `pagehide` count and the store write-back removed on purpose, exactly their two checks failed in one-host WebKit.

Not covered: the full walks (WS-7), a deck of 50 slides, screenshots, geometry, accessibility, `f` and `F5`, Firefox, Safari itself, or a real provider. The Vercel preset ran on `next start` with Vercel's variables set by hand, so `/_vercel/*` answered 404 there, and only the requests were checked.

One timing difference. A press about 700 ms into a step that loads a document crosses the step's end some 20 ms earlier on one host, so it takes the next step sooner. No press is lost in either setup, and the harness checks that.

In WebKit, a `page.goto` that cancels a slide's prefetch logs an access-control line to the console, in both setups. The walks have no `goto` in them and allow no such line. Only the later checks filter it.

**`check` rules.** `src/lib/validate/rules/hosting.ts` holds `presenter-public` (the one line), `storage-clear` and `third-party-script`, as Fit warnings. The last two cover 13.3 rows 2 and 3, and `hosts.frames` turns them off. `rules/index.ts` must list the group. `reserved-route` (row 5) stays with the validators.
