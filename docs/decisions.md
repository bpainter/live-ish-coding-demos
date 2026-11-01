# Decisions

Append only. One short entry per decision a future reader needs.

## Validators

- **`runChecks` is read-only.** It does not call `prepareDeck`. Meters and support are computed live, and a generated file is compared only when it exists. A deck that has never been built checks clean, and a bad `web-features` id reaches the author as a finding, not a crash. The one file it writes is `.live-ish/deck.gen.ts`, because that is how a deck's modules load.
- **Rules reach the raw config through a side table.** `RuleContext` stays small. `facts(ctx)` in `lib/validate/context.ts` holds the author's input, keyed on the assembled deck, because the assembled deck reaches the client and should not carry `writing` or `checks`.
- **Three rule ids exist so every finding has one.** `config` (Integrity) turns a config error into a finding with a docs page. `hook` (Integrity) is the static hook check. `storage-clear` (Fit) is the `.clear()` warning. Every finding needs a stable id, and no other id fit.
- **`viewport` stays, narrowed.** The viewport derives from the split, so the rule now catches only a `split` no layout has and a `split` on a page with no code panel. The first of those would otherwise crash assembly.
- **`eyebrow` stays, redefined.** The eyebrow is now the demo's title by construction, so comparing them can never fail. The rule checks that the title fits one eyebrow line instead.
- **Two `seo-description` rules share one id.** The tier table puts it in Style with its length staying Fit, and a `Rule` has one tier, so there are two objects. `checks.rules` sets both.
- **Strict and explicit relaxing.** `--strict` raises every Fit warning, except a rule the deck relaxed by name in `checks.rules`. Otherwise `"warn"` would mean nothing under `--strict`. Style warnings, such as spoken notes, stay warnings.
- **A generated file that is absent is a pass.** `images`, `public-files`, `poster-fresh`, `og-image`, `og-stale`, `bg-stats` and `skills-stale` run only when their file exists. `.live-ish/` is git-ignored and rebuilt on every `dev` and `build`, and no poster or share image is a neutral state.
- **The intro's description allows two sentences.** One sentence was the old limit, but the starter's `faq` demo uses two, and that demo is the API contract.
- **`seo` and `nav` have pure cores.** `lib/seo-core.ts` and `lib/nav-groups.ts` take the deck as an argument, so the rules run the code the pages run. `lib/seo.ts` and `lib/nav.ts` bind them to the injected deck, which only exists under a bundler.
- **`isDeckError()`, not `instanceof`.** A deck's modules load as CommonJS under tsx unless its package says `"type": "module"`, while the CLI loads as ESM, so one process can hold two copies of the error classes. The name survives that.
- **A hook check that cannot see everything stays quiet.** A spread in `demoHooks`, or a script loaded from outside the beat's folder, could define any name. `hook` is Integrity and cannot be turned off, so a guess there would be a false error with no way out.
- **The 60/40 wording on `file-size`.** The code card is narrower at 60/40 (704 px) than at 50/50 (880 px), so moving to 60/40 cannot fix a long line. The message says to wrap to 44 columns, the width that fits the 60/40 card, which keeps the advice true.
## Themes and copy layouts

- **Theme precedence is page, beat default, demo, deck.** That order is highest first, so a `chrome.beats` default beats a demo's own `chrome`. A page's own `chrome` beats both.
- **Generated theme CSS lives in `packages/engine/assets/chrome/`.** `prepareDeck` copies all ten to `public/live-ish/chrome/`, so `?chrome=<id>` needs no rebuild. The root layout links only themes the deck resolves to. `styles/chrome/` holds no raw color at all.
- **Fonts for previews.** `prepareDeck` copies a family only for themes the deck resolves to. `next dev` and `LIVE_ISH_ALL_FONTS=1` copy all five, so previews show real faces. A production `?chrome=` preview of an unused theme falls back to its system stack with no failed request. `LIVE_ISH_ALL_FONTS` is internal, like `NEXT_DIST_DIR`, for conformance runs.
- **`--fx-*` values are engine-private.** The token contract has no token for scanlines, the counter meter or the title glow, so a theme file picks from closed lists: `motion.effect` and `details`. The generator turns those into `--fx-*`. A theme still cannot add a look of its own.
- **`extends` on a theme file** names the base for missing values, default `glass`. A theme takes its missing tokens from a base, and this field says which.
- **Cards take the code panel's ink.** The contract has no "ink on card" token, and some themes need white ink on the backdrop and dark ink on a gray card. Intro panels, badges and status notes use `--chrome-code-ink` and `--chrome-code-comment` on `--chrome-card-surface`, and `test:contrast` checks those pairs at 4.5:1.
- **The frame base is neutral and solid.** `--glass-*` became `--frame-*`, and blur is gone from frames. `.glass-card` and the other helpers became `.frame-*`. A demo `background` can still show through an author's own translucent panes.
- **The code tab's selected state uses ink and a bar, not bold.** Mono 700 would add 8.9 KB to every demo page, and the state reads without it. Phosphor loads it because mono is its text face.
- **Atkinson Hyperlegible ships unmodified.** See `THIRD_PARTY.md`.
- **Copy slide fields are `light`, `dark` and `accent`.** They replace color-named fields. The stage sets `data-field`, so a layout never names a color.
- **One `.slide` block for every copy layout.** The old composed layouts each drew their own footer and panels. They now share `SlideShell`, and their classes moved from `.sg-*` to BEM under `.slide`, `.card`, `.quote` and so on. Any tool reading `.sg-*` needs the new names.
- **`chrome.copySlides` is parsed and not applied.** It waits for v1.0 at the earliest.
- **`?chrome=` previews built-in ids.** A custom theme shows through its own config, not through a preview of an id the deck does not use.
- **Presenter chrome uses system fonts.** Anything outside the canvas once used the deck's sans, so hidden labels and the reader pill could pull Inter onto a demo page under a theme that does not use it. With system stacks, the font budget depends only on the theme.
- **Headings in the frame base keep a bottom margin, and terminal lines are 28 px.** A spotlight's 9 px band covered the neighboring text at the old sizes.

## CLI and scaffolder

- **`live-ish.shell.json` is committed in each deck.** After `pnpm up`, an untouched shell file and an edited one both differ from the new template. The record of what the engine last wrote tells them apart, so `upgrade` rewrites the first and stops on the second. Without it, every release would need `--force`.
- **The "Generated by live-ish" header marks what the engine owns.** A file under `app/` with the header that no template names is a retired shell file, and `upgrade` removes it. One without the header belongs to the author, and `doctor` only mentions it. `tsconfig.json` has no header, since Next can rewrite the file, so it goes by hash alone.
- **The shell's `tsconfig.json` lists `.next-present` and `.next-capture`.** Next adds the type globs of a custom `distDir` and reformats the file on every build, which would read as drift on any deck that ran `present`. Listing them leaves Next nothing to add.
- **`withDeck()` sets `agentRules: false`.** `next dev` otherwise edits a deck's `AGENTS.md`, and the file is the deck's own instructions, so the shell no longer ignores it.
- **`live-ish check` runs `prepareDeck` first, though `runChecks` stays read-only.** The rules compare generated files when they exist, and every `dev` and `build` rebuilds those files. Without this, `new web-demo x && check` fails on a stale `support.json` after any earlier build. A deck that cannot prepare still gets its rules, which say the same thing with a path and a fix.
- **Long-running commands re-read the deck in a fresh process.** Node caches an imported module for the life of a process, so a second `prepareDeck` in `dev` would see the old slides. `dev` touches `next.config.ts` when rewrites or hosts change, because Next reads them once.
- **`new` edits `deck.config.ts` as text.** Parsing and printing it would lose the author's comments. A small scanner steps over strings and comments and changes one spot, and it refuses an `order` that is not an array in place. A new slide goes ahead of a closing slide, so the closing stays last.
- **`record` runs each command in its own shell.** Files persist across commands in the temp copy; `cd` and `export` do not. stdout and stderr share one file, so they interleave as a terminal shows them. An `# expect-fail` command that passes is an error, because the recording would claim a failure that did not happen. `example: true` lines survive a new recording, and go back after the same number of recorded lines.
- **Schemas are generated from the TypeScript types at build time.** `scripts/build-schema.mjs` walks the compiler API and writes `dist/schema/`, so the types stay the one source. The theme schema is copied from what `gen-themes` generates from the token contract.
- **`@live-ish/verify` exposes `./cli`.** Tier 1 to 3 commands call `run(argv, { root, engineVersion })` from it and return its exit code. Without the package they print the install line and exit 3.
- **`live-ish build` encodes images when sharp is there.** The manifest lives in the git-ignored `.live-ish/`, so encoded files are a build output, and `public/opt/` is ignored too. A plain `next build` skips this and pages keep their masters.
- **`subset-font` is not a dependency.** A deck on system fonts should not carry a font shaper. `live-ish fonts` names the package and exits 3 when a deck has masters and no shaper.
- **`create-live-ish` writes `pnpm-workspace.yaml` for pnpm decks.** pnpm 12 fails an install on a build script it was not told about. `esbuild` and `sharp` ship binaries as optional dependencies, so both are declared off, as in this repo.
- **`--engine <spec>` on the scaffolder is for builds not on the registry,** such as a packed tarball. It stays out of `--help`.
- **The `--server` template loads the runtime from its own origin.** It reads the deck's copy of the runtime, and `dev` and `present` pass `LIVE_ISH_PRESENTER_ORIGIN` for the meta tag. `@live-ish/bridge` replaces this when it lands.
- **`theme new --from` writes `extends`, not a copy.** A small file takes what it leaves out from its base, so a later fix to the base reaches it.
- **`build` and `present` are one implementation.** `build` runs `check`, then the target logic from the hosting work, and it resolves hosting before the deployed prepare, because that step writes a deck module with the notes removed and a failed build must not leave that behind for the next `dev`. `present` keeps the port check, the `/_health` match on the build and the wait for `servers`, on `LIVE_ISH_TARGET=local`. `start` serves what `build` made, so it sets the same target.
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

**Storage keys.** Everything is `live-ish:<deck>:<name>`, where `<deck>` is a slug of the title. `state`, `notes-size`, `rehearsal-log`, `text-view`, `glass`, `sync:<build>` for the channel and `builds`. A tool must read `live-ish:<deck>:state`, not a bare `deck:state`. `.live-ish/deck.json` has `deckId`.

**Different builds.** The sync channel keeps the build in its name, so builds cannot drive each other. A second channel, `live-ish:<deck>:builds`, carries only the build ID, so the "No audience" pill can name both.

**Analytics.** No `@vercel/*` package, at any level. Vercel's two scripts are plain `<script>` tags at paths the platform serves, so the adapter loads them by address. The addresses live in the server layout and reach `SiteAnalytics` as props, so a default build has no `_vercel` in `.next/static`. Analytics load on `/` and `/s/<id>` only, on deployed builds only, and never with `navigator.webdriver` or `?capture=1`. `analytics.script` becomes a lazy import in `.live-ish/analytics.gen.ts`, aliased as `@live-ish/analytics`. Its default export runs once.

**Provider presets.** `withDeck({ provider })` defaults to the provider detected from the environment. Vercel has the full preset: `Vercel-CDN-Cache-Control` on build files, the commit SHA, and the site from `VERCEL_PROJECT_PRODUCTION_URL`, which satisfies the `hosts.site` guard. The others only detect and read their commit. A Vercel preview stays out of search, and on two hosts it shows posters, because the frames host names production in `frame-ancestors`.

**Reader switches.** `reader.enabled: false` turns `/` and `/s/<id>` into 404s and closes `robots.txt`. `reader.index: false` closes `robots.txt`, empties the sitemap and adds `noindex`.

**Stopping `live-ish present`.** `bin/live-ish.mjs` spawns the CLI asynchronously and forwards SIGINT and SIGTERM. With `spawnSync`, a SIGTERM killed the shim and left `next start` holding the port.

**The hosting spike passed: one host stays the deployed default.** `scripts/hosting.mts`, on the starter plus a temporary multi-page demo, in Chromium 145 and WebKit 26.0 (Playwright builds). One host and two local origins gave the same result in both browsers: 80 of 80 checks, 20 of 20 step digests equal, 0 differences. The fallback was not needed. Two named origins passed 79 of 79 in both browsers, without the moved-port check, because two hosts name their port at build.

Covered: every stop forward and back with digests and highlights, Next during playback and into a document load, the last step by key and by the speaker's button, presses with focus in the frame and while an intro's frame warms, 29 key checks, a cleared store followed by a press and a reload, Back and Forward in a multi-page demo after a replay, a link pressed by hand in hands-on mode, and the same build on a second port. The two riskiest cases passed in WebKit on both origin setups: focus asserts replay, and Back has its entry. With the `pagehide` count and the store write-back removed on purpose, exactly their two checks failed in one-host WebKit.

Not covered: the full walks, a deck of 50 slides, screenshots, geometry, accessibility, `f` and `F5`, Firefox, Safari itself, or a real provider. The Vercel preset ran on `next start` with Vercel's variables set by hand, so `/_vercel/*` answered 404 there, and only the requests were checked.

One timing difference. A press about 700 ms into a step that loads a document crosses the step's end some 20 ms earlier on one host, so it takes the next step sooner. No press is lost in either setup, and the harness checks that.

In WebKit, a `page.goto` that cancels a slide's prefetch logs an access-control line to the console, in both setups. The walks have no `goto` in them and allow no such line. Only the later checks filter it.

**`check` rules.** `src/lib/validate/rules/hosting.ts` holds `presenter-public` (the one line), `storage-clear` and `third-party-script`, as Fit warnings. The last two cover what a demo shares with the deck on one origin, so `hosts.frames` turns them off. `rules/index.ts` must list the group. `reserved-route` stays with the validators.

## Verify

**One entry.** `@live-ish/verify/cli` exports `run(argv, { root, engineVersion })`, and the number it returns is the exit code. `bin/live-ish-verify.mjs` runs the same entry from a deck folder with no engine CLI around it.

**Parity runs the tools.** `src/parity/tools.ts` maps each matrix row with no suite to what proves it: a walk mode, `axe`, `check`, `perf`, `warmup` or a self-test. One run answers every row that reads it, narrowed to the row's pages or text, and a row needs a passing check of its own, so nothing passes by being absent. These rows run only on a deck folder. A report built from a manifest file leaves them `not-run`, and `--compare` counts a row that ran on one side apart: it proves nothing either way, so it is neither a match nor a difference. Rows proved by `pnpm test`, CI or a person stay `not-run`, and a test holds that list closed.

**`parity --compare` needs no deck.** It reads two files, so `delegate` falls back to the working folder, and in a bare checkout it finds `packages/verify` beside the engine.

**One Playwright.** `@playwright/test` alone: parity's imports moved off `playwright`, so the package pins one version.

**What walks read.** `@live-ish/engine/verify` is an internal export, so nothing else reaches into engine paths. `.live-ish/deck.gen.ts` is loaded and assembled, and every target comes from that data. A test fails if a walk's source names a slide of the starter.

**`/_health` names the server.** It reports `server: "production" | "development"`, because `walk underlay` has to tell `next start` from `next dev` to decide whether a budget applies.

**A network profile turns site isolation off.** Under isolation a cross-origin frame is its own target, and a CDP session on the page does not throttle it. The local mode's frames are cross-origin, so a `venue` run with isolation on leaves them on the full-speed loopback. `walk underlay` and every `perf` task run with isolation off when a profile is on. Numbers are slower and honest.

**Budgets.** `packages/verify/budgets.json` is the one file. `walk underlay` defaults to `venue`, three runs, and the median of each run's p90, per the reference environment. On `next dev` it prints its numbers and "dev server: budget not applied", and exits 0. A small deck's arrivals repeat until a window has 50.

**Self-tests break the deck in the browser.** `pnpm --filter @live-ish/verify selftest` runs each walk with one thing broken through an init script or a route, and passes only when the walk fails and names it. A build per break would take most of an hour. `sabotage` is reachable from code only, never from the CLI.

**Runtime errors fail a walk.** A walk used to read only asserts, so a selector that matched nothing could pass when the step had no assert after it. The protocol watch now keeps every `error` message, and a walk fails on it with the step's name.

**Result files.** `perf` writes `.live-ish/perf/<date>-<commit>-<task>[-<label>].json`, so a deck keeps its own and the repo stays clean.

## Variants

**`render.ts`, not a field.** A public build holds the deck as data with no functions in it, so a template filler cannot sit in `demo.ts`. It is `demos/<id>/render.ts`, an import that survives as `routes.ts` does, and it applies to every beat of the demo.

**Shells.** `shells/<id>.ts` default-exports `defineShell({ id, before, after, styles, scripts, shownClass, banned })`. `prepareDeck` imports the folder and `assembleDeck` registers them, so `check`, the composer and the poster hash all see them. A page opens one with `shell: { id, outside, scrolls }`.

**Addresses.** A beat's `address` opens a path `routes.ts` serves. An HTML answer from that handler is composed like any frame document, so the runtime and the CSP reach it, and every other answer stays the demo's own. All demo routes are root addresses: `reserved-route` closes `/demos`, so the old per-build route path is gone.

**`when` on an assert.** A `CSS.supports()` query. A browser that fails it skips the assert, which counts as passed, so digests still match. This replaces the walk's old exception for one feature, and it is what `walk --without=<switch>` relies on.

**A blocked frame is data.** `refusesEmbedding(frame)` reads `frame-ancestors 'none'` in a page's `csp`. Walks check its error state instead of its steps, and `poster-fresh` skips it, because nothing can capture it.

**The spotlight fixture is a deck page.** `demos/00-fixtures/` sits in the conformance deck's `order`, so `walk fixtures` runs on `next start` with no dev-only route. Reader pages show it, which a conformance deck can afford.

**Digests.** `history=` is the frame's own depth, because `history.length` is the tab's and a replay never takes back what a forward run added. Asserts are numbered per step, because a replay leaves out toggles and clicks and so shifts action indexes. Both differed between forward and Back on every multi-page page, and the old walk only logged it.

**Reloading toggles.** A step run now stops at the end of its segment. Before, the first segment ran on past the toggle and threw `flag-unknown`, and nothing noticed until a walk read runtime errors.

**History replays.** A page with a `navigate` that has `history` replays every action, so the entries exist when a later step walks over them. Opening the route directly left Forward with nowhere to go.

**Poster inputs.** The hash covers `frame-base.css` (it named a file that no longer exists), and a terminal page's theme file. `demo.ts` is out: notes are not inputs, and the JSON already holds the frame and the actions.

**The QR.** `QR_BOX` was 544, the plate's outer width, and the plate holds 496. The image shrank to fit, and modules landed on 15.03 px. `walk deck` caught it.

**Captures stay out of the examples.** `public/posters`, `public/opt` and `public/intro` are ignored in `examples/*`. They are regenerated, and the binary allow-list stays short.
## Server frames, parity and export

**The deck names itself on the frame's address.** A server frame's first request carries `?presenter=<origin>&mount=1`. A server can't know the port a deck runs on, and `live-ish capture` or a second `present` may use another. `client.js` remembers the value in sessionStorage, because a `navigate` step loads a document with no such parameter. `frame-ancestors` comes from `LIVE_ISH_PRESENTER_ORIGIN`, or any local deck when that is unset, so a crafted address can't widen who may embed the app.

**The runtime loads from the deck, not the app.** An app with its own copy can drift from the deck. Loading it from the deck means a frame always runs the runtime of the deck driving it, and an app needs no build step.

**`index.html` belongs to the deck.** `frameUrl` drops it for a server route, so an app answers its real path and `path: "/"` means `/`.

**A stopped app is asked about by the deck's own server.** No request may go to a dead origin, and a browser can't test an origin without logging a failed request. So the frame mounts only after `/demos/live-ish-server/<app>` says yes. That route lives under the frames catch-all because `/_health` is `force-static`, and it adds no shell file. It opens a bare connection and sends nothing, because an app may log every request, and only answers for an app the deck names. If an app dies during a page, the next document fails in the browser as usual, and the status pill says so.

**A bridge page counts as multi-page.** `client.js` sets `data-pages`, so the runtime waits for a load to finish before it navigates. Without it, an instant replay's navigate replaces the entry and `history.length` differs from the forward run, which changes the digest.

**A deployed build drops an app at localhost.** `externalOrigins` leaves it out, so a stranger's browser never asks their own machine.

**`window.name` keeps a session, so WebKit's Back guard has no count on a server frame.** The runtime only keeps its history count while the name is empty or its own. Chromium answers from the Navigation API. `examples/server` uses `navigate` with a URL and no `history`.

**Parity compares outcomes and facts.** A row's facts are booleans about behavior, with no timing, id or deck text. `n/a` does not equal `pass`, so a deck with no demos differs on every row that needs one, and that is the honest result. Digests hold what a deck shows, so they compare only between two runs of one target.

**Local runs say nothing about deployed defaults.** The suites run on local builds, where E-3 to E-7 do not apply. Those exceptions are not exercised by a comparison of two local builds.

**The matrix is edited by hand.** Edit `parity/matrix.json`, then run `pnpm parity:docs`.

**`live-ish export` crawls a real build.** `output: "export"` refuses the frame route handlers, which read the request, and it would need a second shell. A normal build served on a spare port writes down what it answers, so an export can't drift from what a host would serve. An export is reader-only whatever `presenter.onHost` says, and `prepareDeck` takes an `export` target so notes stay out in that case too.

**Each flag combination is a file.** A static host ignores a query, so `frameDocument` maps flags to `index.off-<flag>.html` beside the entry, which keeps relative links working. Only what is off is in the name, so the default stays `index.html`. `flagCombinations` walks `segments()` as well as `flagsAt()`, because a reloading toggle can mount a mid-step state that no step ends on.

**A slide move is a full load on a static host.** RSC payloads vary by a request header no static host can see, so Next falls back to a document load. Reader step state lives in the URL, so nothing is lost, and the console stays clean.

**An export needs the site root.** There is no `basePath`, so a project page on a subpath does not work yet. A custom domain or a user page does.

**A `<meta>` CSP is weaker than the header.** `frame-ancestors` and reporting can't be set from one, which is why `csp-enforce` demos fall back to posters. Any page can embed an exported frame.
## AI tooling

**Next's agent rules stay off, and ours are canonical.** `next dev` adds a block of its own to `AGENTS.md` when it detects an agent, and restores it if removed. A deck's `AGENTS.md` is the deck's: its rules say to edit no Next.js code, so the block would point agents the wrong way. `withDeck()` sets `agentRules: false`, now after the `next` option spread, so a deck cannot turn it back on by accident. With it off, `next dev` only strips Next's own marked block, if one is there, and writes nothing else. `pnpm skills:fresh` runs a real `next dev` with an agent detected and compares the file byte for byte. Nothing ignores `AGENTS.md`. `add agents` puts our block above any text a file already holds, so an older Next block stays as the author's text until the next `next dev` removes it.

**The block's markers follow Next's form**: `<!-- BEGIN:live-ish -->` and `<!-- END:live-ish -->`. `upgrade` replaces what sits between them, so an edit inside the block is lost, as the marker line says. A file with no markers, or with them out of order, is left alone with one printed line.

**The shell tracks the lock.** `.live-ish/` is ignored, but `skills.lock` is what remembers a deletion and tells an edit from an old file, so a fresh clone needs it. The shell's `.gitignore` is now `.live-ish/*` with `!.live-ish/skills.lock`.

**Deletions are per copy.** `deleted` in the lock holds `.claude/skills/deploy-deck`, not `deploy-deck`, since an author may use one tool. A folder the lock knew and the disk lacks is a deletion. Deleting `.claude/` or `.agents/` whole counts for every skill in it, new ones included. `add agents` and `skills sync --force` are the two ways back.

**`skills sync` in a deck keeps edits, as `upgrade` does.** `--check` still reports an edit as a difference, `--force` restores everything. `upgrade --force` does not touch skills: it is about the shell, and `create-live-ish` calls it. In the monorepo, every file in the two folders is generated, so `sync` rewrites them and an extra file is drift. In a deck, those folders may hold the author's own skills, so only the engine's skill names and the lock's files count.

**`skills-incoming/<name>/` splits by tool**: `claude/` and `agents/`. A manual skill's two copies differ in frontmatter, so one path could not hold both. The folder is rewritten on each sync, so it only ever holds what is waiting.

**`skills-stale` also reads the files.** `check` runs the sync comparison in a deck, as a Fit warning with a line per edited file, so a kept edit never fails an ordinary run. Files that are missing are no finding: nothing may require agent files.

**A contributor skill says so in its metadata**, `live-ish-audience: contributor`. It lives beside the others, and `renderSkills("deck")` leaves it out.

**The lock's schema is the oldest on disk.** `live-ish-schema` at the top of the lock is the minimum over the `SKILL.md` files actually there, so a kept edit of an old skill keeps `skills-stale` honest. `skills-stale` still reads the older `schema` key.

**`skills-ref` is the PyPI package, at 0.1.1.** It installs on Python 3.11 or later, and its command is `agentskills`. An npm package of the same name comes from another author, so it is not used. It stays out of `pnpm test`, because that would add Python to every contributor's setup. `test/skills-lint.ts` holds the same limits with no install. It refuses `disable-model-invocation`, which the spec's own frontmatter merge needs, because it knows portable fields only. `pnpm skills:ref` checks those three Claude copies with that key removed, and prints that it did.

**A golden task carries a scripted solution.** `pnpm test` plays it through the judge the agents face, so the prompt, its setup, every command and the judge are proven on each PR with no API cost.

**`pnpm evals:claude` spends nothing without `--run`.** Runs use `--setting-sources project` and `--strict-mcp-config`, so a machine's own skills and servers cannot change a result, and a golden run may only edit files and call the CLI.

**`--json` failures are documents.** A misuse or environment failure used to leave stdout empty, so a script had nothing to parse. It now prints `{ version, ok: false, error: { code, message, fix } }` on stdout, and the same words on stderr.

**`create-live-ish` names `packages` in `pnpm-workspace.yaml`.** pnpm 9 stops on that file without it. Newer pnpm reads the same file.
## Docs and foundations

**The docs app is also a deck.** The live starter runs inside `docs/`, on one origin. The engine's routes have no base path, so the deck keeps `/s`, `/present`, `/speaker`, `/demos` and `/_health`, and the docs take every other address. Two root layouts, `app/(site)` and `app/(deck)`, keep the CSS apart. `pnpm generate` copies the starter and the shell in, git-ignored, so they cannot drift. The copy sets `presenter.onHost: true`, because the starter's notes are public and a public presenter is the proof. `check` warns about shell files on this one deck, since the docs app is not a standard shell. `next.config.ts` here is hand-written.

**One route renders every page.** Pages are read from disk and compiled with `@mdx-js/mdx` at build. `@next/mdx` was not used, because generated fragments and the Markdown copies need the source text anyway. `<Generated name="x" />` expands before compiling, so the site and `/<page>.md` hold the same words. Generated rule pages compile as plain Markdown, so a brace in a rule's text cannot break the build.

**Code blocks have no syntax colors.** Highlighting would need a dependency or inline styles. One quiet design does not need it.

**`shell` has a hand-written error page.** `check` prints a `shell` finding with a docs address, and it is not a rule, so nothing would have generated one. A test now reads the addresses in `check.ts`.

**Install policy uses `permissions`.** pnpm 12.16.1 has a real `permissions` setting, with `build` and `skills` keys. `build` takes precedence over `allowBuilds`, and `pnpm permissions list` reads both. By default an unlisted build script stops the install with `ERR_PNPM_IGNORED_BUILDS`, and the script does not run. `create-live-ish` still writes `allowBuilds`, which works.

**The fixed group uses a glob.** `["@live-ish/*", "create-live-ish"]`, because Changesets rejects a name that is not in the workspace. A test resolves the glob against the four names. `scripts/release/sync-packages.mjs` writes the shared metadata and the version when a package joins.

**Pre-release mode is on, tag `next`.** The first version is `0.1.0-next.0`. `publishConfig.tag` is `next`, and the publish workflow stages under `next`. `latest` only moves by hand.

**The publish workflow has a variable gate.** `vars.PUBLISH_ENABLED` must be `true`, on top of the protected environment and the trusted publisher. So a stray tag does nothing until the repository owner has set all three up.

**npm 12.2.1 in the publish job.** `npm stage` was checked on 12.2.1, with `publish`, `list`, `view`, `approve`, `reject` and `download`, so that is the pinned version.

**The offline job uses a network namespace.** Blocking outbound traffic with `iptables` on a hosted runner can cut the runner's own connection. `unshare --net` gives the build and the walk loopback alone, and the runner keeps its link.

**`prepare:decks` runs before typecheck.** A fresh checkout has no `.live-ish/`, and the examples' `tsc` needs the alias target.

**pnpm 9 needs `packages` in `pnpm-workspace.yaml`.** A blank folder runs whatever pnpm Corepack has as its default, and pnpm 9 refuses a workspace file without that field. The scaffolder now writes `packages: ["."]`.

**Prettier covers only files that joined.** `.prettierignore` lists `packages/`, `examples/` and a few long scripts, so `format:check` is real today without reformatting those files.

**The shipping-source spike passed: the engine ships source through `transpilePackages`.** A deck builds with `generateStaticParams` reached through a re-export, `server-only`, the `/*turbopackIgnore: true*/` paths and `outputFileTracingIncludes`, all from inside the package. The proof that stays true is `scripts/ci/starter.mts`, which scaffolds a deck from the packed tarballs with pnpm and npm, runs a production build and walks it. The fallback was not needed.

**The syntax-color spike passed: themes reach syntax colors with no client JavaScript.** Shiki 4.5.0 renders each token with a sentinel color, and the theme's `colorReplacements` maps each sentinel to `var(--chrome-code-*)`. Sentinels stay on the outer `<pre>`, which `renderCodeFile` discards. Output stays server-rendered, so the per-theme render fallback was not needed.
## Share card

**The default card is a route, not `opengraph-image`.** Next's file convention outranks config metadata, so it would hide a `live-ish og` capture. `app/live-ish/og/card.png/route.ts` is a plain shell file that `next/og` draws at build, and `seo-core` names it only when there is no capture. With no site there is no address for a card, so that build keeps the text card.

**The card draws only what its font holds.** `next/og` asks Google Fonts for any glyph its bundled font lacks, with the deck's text in the address. A failed font load only logs, but a failed emoji load stops the build, and a build must pass offline. `drawable()` strips emoji and symbols, and drops a line that would lose a letter or digit, because half a title reads as a different title. A title in another script gets a card with no title on it. `og:title` and the alt text still carry it. A test renders every listed character with `fetch` trapped, so a new font in Next fails there.

**Share images are allowed in `robots.txt`.** They sit under `/live-ish/`, which is disallowed, and a preview bot that may not fetch an image shows none. That also blocked `live-ish og` captures. `Allow: /live-ish/og/` is the longer match, so it wins.

**`export` saves the card.** It is a route, so copying `public/` would miss it, and every exported page names it.

## Images

**`image-alt` is Integrity.** An image with no `alt` must fail `check`, and Fit is only a warning without `--strict`. Types can't hold it, because `check` reads data and a deck need not run `tsc`. Blank text counts as none. It covers a slide's `image`, a grid card's `image` and an intro's `visual`. A `background` image renders with an empty alt, but it needs one here too: the rule has no exception, and the text view still shows it.

## Server template

**The `--server` template uses `@live-ish/bridge`.** This replaces the earlier entry that loaded the runtime from the app's own origin. The deck now names itself in `?presenter=`, so the app needs no presenter origin of its own and no path into the deck's `public/` folder.

**`new web-demo --server` installs the bridge, and installs first.** The bridge is optional, so a fresh deck does not have it, and `server.mjs` would stop on import at the first `dev`. It goes in `dependencies`, because the deck runs it. A failed install exits 3 before anything is written, so a retry never meets a taken id. A deck that already resolves the bridge installs nothing.

**`onSignal` keeps listening.** Ctrl-C reaches the whole process group and the shim forwards it, so the CLI hears each stop twice. A one-shot listener left the second on Node's default, which killed the CLI before it stopped the deck's servers. Every Ctrl-C of `dev` left the app running, and the next `dev` found the port taken and served the old code. `present` waited for `next` to exit first, so it had the same gap for longer. A repeat within a second is ignored as the echo, and a later one exits 130, because a hung server must not trap someone on stage.

## Starter

**Comments sit beside what they explain, once each.** The starter is the API contract, so comments are all it gained, and a one-off script confirmed that by stripping them and comparing. The commented `callouts` line was run uncommented through `check --strict`, so it works when an author uses it.
## Verify, closing the gaps

**`--compare` no longer passes on rows it never compared.** This replaces the entry that counted a one-sided row apart as neither a match nor a difference. That rule let a manifest report exit 0 with 40 of 205 rows compared. A one-sided row is now a difference unless an exception lists it, so exit 0 means every row compared or was listed. A row that failed on both sides is a difference too, because two failures matching proves nothing. Rows neither side ran stay out of it: the matrix names `pnpm test`, CI or a person as their proof. `--partial` judges only the rows that compared, exits 0 if those hold, and prints that this is not a parity result, so a job comparing against a manifest can still gate on real differences. A report built from a manifest has no tool rows, so a full `--compare` against one exits 1 until those rows have a source.

**A row's scope reads `where` as well as the message.** A failure often names its subject only in `where`, so a row scoped by text could miss the failure and pass on its own passing lines.

**`@live-ish/verify` ships the matrix.** The tarball had no `matrix.json`, so `parity` failed on any installed deck. `prepack` copies it in and `postpack` removes it, so the repo keeps one file.

**`walk underlay` with no poster exits 3.** With nothing captured, every arrival is a live frame, the poster checks passed on zero, and the run took over 15 minutes to say so. The walk asks the running server for each poster with a `HEAD` request first, because a capture needs a rebuild before `next start` serves it. None served exits 3, meaning it did not run. Some served runs, and fails naming the rest. No swap compared fails. A deck that turned posters off gets the timing and a note. `next dev` still prints its numbers and exits 0.

**`axe --presenter` scans every copy slide, not one per layout.** A layout's variants fail on their own: a dark grid on contrast, a portrait grid on alt text. The text view's size checks lost their cap of 12 slides for the same reason, which had been dropping layouts.

**`walk theme` holds the browser half of the theme bar.** `--chrome=<id>` runs one theme and no `--chrome` runs all of them, comparing each against `glass`, or `flat` for `glass` itself. A frame screenshot uses a fixed whole-pixel clip, because a theme's border moves the frame by part of a pixel and an element screenshot then rounds to another size. Reduced motion reads the top document only: no theme enters a frame, and a demo's own CSS is its author's. Each negative check has a control that sees the thing with the setting off, so a check that measured nothing fails instead of passing. Reduced transparency goes through CDP, because Playwright has no option for it, so it is Chromium only. Blur lives on intro surfaces, so the check reads an intro as well as a framed page.

**A stopped app is walked, not skipped.** A plain `walk` and `walk --mode=servers` check the poster, the note, that no frame mounts and that nothing asks the dead origin. A walk leaves apps as it finds them, so FR-19 reads `n/a` while an app is up, and `--mode=servers` with nothing stopped exits 3, since it read nothing. It needs a captured deck, because a missing poster fails.

**A slow window read as a stuck Next.** `walk advance` presses at 700 ms to land mid-playback, and on a step with a code lead and a reveal that is 650 ms, the step's own end. That press can leave the page. If the audience window is busy with a long task, it shows only after the walk's 300 ms check has given up, so the walk pressed again, passed `next`, and reported "Next stayed". The stage was right each time. A 500 ms stall failed 8 of 8 real walks before the fix and 0 of 8 after. The walk now checks where the deck is before that press, and a real miss names the slide it found. With no stall it never failed: 322 attempts swept across the boundary and 24 walks four at a time. So the stall explains the recorded failure, though that deck could not be rerun to confirm it.

**The warm-walk target stays 0.** The 304s were real: `versioned()` and the hour rule cover known folders, and a deck may keep a stylesheet anywhere under `public/`, so Next's `max-age=0` rechecked it on every frame mount. `prepareDeck` now lists a deck's own `.css` and `.js` files in `deck.json`, and `withDeck()` gives those exact paths the hour rule. `perf headers` probes one, and `perf walk` names the files when it misses the target.

**A pill press keeps focus through a step.** Next on a demo slide plays a step in place, and a step's click focuses an element in the frame, which takes focus from the presenter's document. A keyboard reader's next Enter then pressed the demo. The stage records the pill control and restores it when the run reports done. Hands-on mode is left alone, because there the frame is meant to hold the keyboard.

**The text view leaves out the closing caption.** `caption` names the QR code, which the text view replaces with the link, so "Scan for the link" would point at nothing.
## CI enforcement

**Capture comes before the build, not between two builds.** `live-ish capture` builds and serves a copy of its own in `.next-capture`, so `next build` after it picks the posters up and one `next start` serves them. Build, start, capture, rebuild and restart would cost the same two builds for more steps.

**`ci:capture` prepares first and fails on zero posters.** Capture reads a deck's companion apps from `.live-ish/deck.json` before its build writes that file, so a clean checkout of a server deck captured nothing and exited 0. With no posters every arrival waits for its live frame, and the first budgets run on GitHub failed for that reason: 159 ms p90 against 100, on zero poster arrivals. A capture that writes none is a failure here, because the walk below it would measure the wrong thing.

**Budgets warn on a pull request and block a release.** `continue-on-error` at job level hides a failure from a caller's `needs`, so listing the workflow in `publish.yml` would prove nothing. A `blocking` input turns it off for the release call only.

**gitleaks runs from the release binary, held to its SHA-256.** `gitleaks-action` needs a paid license once the repo sits in a GitHub org, and it fetches the same binary without checking it. The cost is that Dependabot does not bump it. The command is `detect`, the form the release checklist names.

**Raw results go on a draft GitHub release.** Artifacts expire, so a job in `publish.yml` gathers every `results-*` artifact and attaches one tarball to a draft release for the tag, ahead of staging, so nothing ships without its numbers. That job is the only one that can write to the repository, and it checks out no code. CI has no credential for the docs host, so the release is the public address for these files, not the docs site.

**Hosting and the server deck run on every pull request, nightly and before a release.** Nightly was the requirement, but all eleven hosting runs and the comparison took under 8 minutes, about the size of the other jobs, so they fit on a pull request too. The server deck's job lives in `conformance`, which gained a schedule, so there is one copy of it.
## Keeping this repo public

**The scan's term list is hashed.** Base64 only looks hidden, because one command decodes it. `scripts/scan/terms.hashed` holds truncated salted SHA-256 instead. The salt is public, so a guess can be confirmed, but the list cannot be read back. The file also lists the word lengths the scan looks for, kept apart from the hashes. Patterns that are public anyway, such as a home folder, stay readable in `private.mjs`.

**One entry catches every separator.** A term is lowercased, split into words and joined by one space before hashing, and a file goes through the same steps, so one entry catches `a b`, `a-b` and a pair split across two lines. Everything a case-insensitive substring check caught still hits: the first word may end a longer word, the last may start one, and the words between stand alone. Hashing costs about half a second on the whole repo, up from about a tenth, and each unique word or run of words is worked out once.

**A finding names a hash prefix, never a term.** Findings land in public CI logs, so a term in a path is blanked in the path too. `--add` reads a new term from stdin, so it reaches neither an argument list nor a shell history.

**The one-time import scripts are gone.** They ran once, before the first commit, and nothing needs them now. `scripts/export.mts` is a different thing: it walks the output of `live-ish export`.

**The parity matrix has no `source` column.** A row names a capability and the check that proves it, and where the behavior came from helps no reader. Rows and exceptions about things that never reached this repo are gone too, and the ids that remain did not change, so a gap in the numbering is expected.

**This file was rewritten once so each entry stands alone.** It is otherwise append only. References to documents a reader can't see were replaced by the reasoning they stood for.

**`s` opens the other window.** In the audience window it opens the speaker window, and in the speaker window it opens the audience window. A press with that window already open focuses it and does not reload it, so a stray key on stage cannot restart a demo.

**WebKit walks run on macOS runners.** On Ubuntu, Playwright's WebKit timed out on animation-frame waits and sampled no frames on demo slides, while the same walks passed on macOS. Safari only ships on Apple systems, so macOS is the closer proof. macOS minutes are free on a public repo and cost more on a private one.

**An inner document can load after the runtime is ready.** The runtime is ready at `DOMContentLoaded`, so a step that reads an inner `<iframe>` first waits for its `load`, through a hook that returns a promise.

**The frame's history count is written on `beforeunload`.** Chrome's RenderDocument commits the next document before `pagehide` runs, so a `window.name` write there is lost. Playwright 1.58.2 switched RenderDocument off, which hid this from every walk. Playwright 1.64.1 leaves it on, so the walks now run Chrome the way an audience does.

**The stage blurs a focused frame before it takes focus back.** Playwright's Firefox 157 ignored a parent `focus()` while a cross-origin frame held focus, and Firefox 146 did not. A blur first works in all three engines, so it costs nothing where the browser never needed it. A stock Firefox was not checked with a real focus state.

**A WebKit keys walk notes a frame that refused focus.** WebKit gives a cross-origin frame focus only with a press behind it, and `?step=last` has none, so the forwarded Tab goes unchecked there and is not a failure.
