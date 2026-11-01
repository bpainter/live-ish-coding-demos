# Parity matrix

Generated from `parity/matrix.json` by `parity/render.mjs`. Do not edit.

204 capabilities, 40 of them proved by `live-ish parity`. Every other row names the tool that proves it.

## Routes

| ID | Capability | Target | Phase | Proving check |
|---|---|---|---|---|
| RT-1 | `/` renders slide 1, then moves to `/s/<id>` | engine | v0.1 | `parity routes` |
| RT-2 | `/s/<id>`, prerendered per slide | engine | v0.1 | `parity routes` |
| RT-3 | `/s/<n>` redirects to slide n | engine | v0.1 | `parity routes` |
| RT-4 | `/present?s=<id>`, rewritten to a prerendered page | engine | v0.1 | `parity routes` |
| RT-5 | `/speaker?s=<id>`, rewritten to a prerendered page | engine | v0.1 | `parity routes` |
| RT-6 | Bare or malformed `s` lands on the first slide | engine | v0.1 | `parity routes` |
| RT-7 | Unknown id: first slide in the windows, 404 for readers | engine | v0.1 | `parity routes` |
| RT-8 | `/_health` names the build, slides and pages | engine | v0.1 | `parity routes` |
| RT-9 | Custom 404 page | engine | v0.1 | `parity routes` |
| RT-10 | Frame documents and build files at `/demos/<demo>/<build>` | engine | v0.1 | `parity frames` |
| RT-11 | Root-level addresses a demo declares, so shown code uses real paths | engine | beta | `parity frames` on the conformance deck |
| RT-12 | Spotlight fixture, development only | examples/conformance | v0.1 | `walk fixtures` |
| RT-13 | `?step=`, `?step=last`, `?glass=`, `?capture=1`, `?fade=`, `?rehearse=1`, kept across slides | engine | v0.1 | `parity routes` |

## Keys

| ID | Capability | Target | Phase | Proving check |
|---|---|---|---|---|
| KY-1 | Right arrow, PageDown, Space: Next step, then next page | engine | v0.1 | `walk keys` |
| KY-2 | Left arrow, PageUp, Backspace: Back one step, then previous page | engine | v0.1 | `walk keys` |
| KY-3 | Shift with an arrow: Next or previous page, step 0 | engine | v0.1 | `walk keys` |
| KY-4 | Home, End: First or last slide | engine | v0.1 | `walk keys` |
| KY-5 | `b`, `.`: Blank | engine | v0.1 | `walk keys` |
| KY-6 | `f`: Fullscreen | engine | v0.1 | `walk keys` |
| KY-7 | `h`: Hands-on mode | engine | v0.1 | `walk keys` |
| KY-8 | `l`: Terminal page: hide the recording for a live terminal | engine | v0.1 | `walk keys` |
| KY-9 | `r`: Reset and replay the step | engine | v0.1 | `walk keys` |
| KY-10 | `t`: Start or pause the timer | engine | v0.1 | `walk keys` |
| KY-11 | `d`: Rehearsal overlay and action summaries | engine | v0.1 | `walk keys` |
| KY-12 | `o`: Open the frame standalone | engine | v0.1 | `walk keys` |
| KY-13 | `s`: Open or focus the other window | engine | v0.1 | `walk keys` |
| KY-14 | `g`: Speaker: go to a slide number | engine | v0.1 | `walk keys` |
| KY-15 | `?`: Keyboard help | engine | v0.1 | `walk keys` |
| KY-16 | Escape: Closes overlays; forwarded from frames | engine | v0.1 | `walk keys` |
| KY-17 | F5: Reserved, no deck action | engine | v0.1 | `walk keys` |
| KY-18 | Reader scoping: Presenter keys off, letters act only from the stage | engine | v0.1 | `walk keys` |
| KY-19 | Keys forwarded from a focused frame: Clicker keys work with focus in a frame | engine | v0.1 | `walk keys` |
| KY-20 | Space and Enter on a focused control: Presses it in reader and speaker windows | engine | v0.1 | `walk keys` |

## Presenter behaviors

| ID | Capability | Target | Phase | Proving check |
|---|---|---|---|---|
| PR-1 | Two-window sync over `BroadcastChannel`, `localStorage` fallback | engine | v0.1 | `walk` speaker checks |
| PR-2 | A refresh resumes; a typed `?s=` wins on a navigate load | engine | v0.1 | `parity presenter` |
| PR-3 | Build ID in the channel name | engine | v0.1 | `parity presenter` |
| PR-4 | Presence: "No audience" pill and coral dot | engine | v0.1 | `parity presenter` |
| PR-5 | Speaker layout: previews, next panel, steps block, notes, footer | engine | v0.1 | `walk` speaker checks |
| PR-6 | One status pill with six states | engine | v0.1 | `parity presenter` |
| PR-7 | Notes rendering: paragraphs, quotes, lists, code, bold, directions | engine | v0.1 | Unit test |
| PR-8 | Notes size 28 to 56 px, remembered | engine | v0.1 | `parity presenter` |
| PR-9 | References: support, sources, jump to step, actions | engine | v0.1 | `parity presenter` |
| PR-10 | Cautions on the last step, `ifKeyboard` box in hands-on | engine | v0.1 | `walk` |
| PR-11 | Timer: elapsed, over or under, pause, reset, synced | engine | v0.1 | `parity presenter` |
| PR-12 | `?rehearse=1` log and JSON export | engine | v0.1 | `parity presenter` |
| PR-13 | Rehearsal overlay: step, digest, duration, asserts, p95 frame time | engine | v0.1 | `parity presenter` |
| PR-14 | Section drawer with its keyboard contract | engine | v0.1 | `walk drawer` |
| PR-15 | Go-to dialog | engine | v0.1 | `parity presenter` |
| PR-16 | Keyboard help, filtered by mode | engine | v0.1 | `walk a11y` |
| PR-17 | Blank, with flag and outline on the preview | engine | v0.1 | `parity presenter` |
| PR-18 | Hands-on mode and its replay on exit | engine | v0.1 | `walk` |
| PR-19 | Wake lock, cursor hidden after 2 s | engine | v0.1 | `parity presenter` |
| PR-20 | Grain overlay, audience window only | engine | v0.1 | `parity presenter` |
| PR-21 | Neighbor images decoded ahead | engine | v0.1 | `perf nav` |
| PR-22 | RSC prefetch of neighbors | engine | v0.1 | `perf nav` |
| PR-23 | Crossfade between slides | engine | v0.1 | `walk transitions` |
| PR-24 | `?glass=off`, solid surfaces everywhere | engine | v0.1 | `parity presenter` |
| PR-25 | Open frame, audience window controls | engine | v0.1 | `walk keys` |
| PR-26 | Posters in speaker previews | engine | v0.1 | `walk` speaker checks |
| PR-27 | Stuck-playback watchdog at 1500 ms | engine | v0.1 | `walk --mode=advance` |
| PR-28 | Audience focus claim on arrival | engine | v0.1 | `walk focus` |
| PR-29 | Window titles per slide | engine | v0.1 | `parity presenter` |
| PR-30 | Dark speaker fallbacks: reduced transparency, forced colors, reduced motion | engine | v0.1 | `parity presenter` |

## Demo engine actions

| ID | Capability | Target | Phase | Proving check |
|---|---|---|---|---|
| AC-1 | `pointer`: Ghost cursor glides to an element | engine | v0.1 | `walk` on a conformance page for that action |
| AC-2 | `click`: Cursor, ripple, real click, link wait in multi-page builds | engine | v0.1 | `walk` on a conformance page for that action |
| AC-3 | `key`: Keycap, then the named DOM effect in `via` | engine | v0.1 | `walk` on a conformance page for that action |
| AC-4 | `focus`: Focus, with optional visible ring | engine | v0.1 | `walk` on a conformance page for that action |
| AC-5 | `type`: Character-by-character input | engine | v0.1 | `walk` on a conformance page for that action |
| AC-6 | `paste`: Value set, input event, "Paste" caption | engine | v0.1 | `walk` on a conformance page for that action |
| AC-7 | `resize`: Animates a container, or the frame through `:viewport` | engine | v0.1 | `walk` on a conformance page for that action |
| AC-8 | `toggle`: Flips an enhancement flag, reloading where the flag needs it | engine | v0.1 | `walk` on a conformance page for that action |
| AC-9 | `navigate`: URL, back or forward, inside the frame | engine | v0.1 | `walk` on a conformance page for that action |
| AC-10 | `network`: Slow or fast, through the `setNetwork` hook, with a caption | engine | v0.1 | `walk` on a conformance page for that action |
| AC-11 | `hook`: Calls a named `window.demoHooks` function | engine | v0.1 | `walk` on a conformance page for that action |
| AC-12 | `terminal`: Reveals a range of recorded lines | engine | v0.1 | `walk` on a conformance page for that action |
| AC-13 | `reveal`: Shows a hidden element | engine | v0.1 | `walk` on a conformance page for that action |
| AC-14 | `wait`: Pauses; skipped or settled during replay | engine | v0.1 | `walk` on a conformance page for that action |
| AC-15 | `assert`: The full grammar: `:selector`, `focused`, `visible`, `hidden`, `count=`, `value-length`, `inline-size`, `text~=`, `contains:`, `attr:`, `no-attr:`, `url=`, `style:`, `columns=` and the rest of `evaluate()` | engine | v0.1 | `walk` on a conformance page for that action |

## Demo engine behaviors

| ID | Capability | Target | Phase | Proving check |
|---|---|---|---|---|
| EN-1 | Three beats plus `single` pages | engine | v0.1 | `check`, `walk` |
| EN-2 | A section mixing frame kinds across beats | engine | v0.1 | `walk` on conformance |
| EN-3 | Code lead of 400 ms, a press during it finishes the step | engine | v0.1 | `walk --mode=advance` |
| EN-4 | Next during playback finishes the step | engine | v0.1 | `walk --mode=advance` |
| EN-5 | Deterministic Back: fresh document, instant replay, digest | engine | v0.1 | `walk` |
| EN-6 | Reloading flags split a step | engine | v0.1 | `walk` |
| EN-7 | Frame history guard, Safari focus relay | engine | v0.1 | `walk --browser=webkit` |
| EN-8 | Spotlights: radii, merge, inset mode | engine | v0.1 | `walk fixtures` |
| EN-9 | Settle gate and forced show at 2000 ms | engine | v0.1 | `walk fixtures` |
| EN-10 | Top-layer holes in spotlights | engine | v0.1 | `walk fixtures` |
| EN-11 | `spotlightClip` and keycap placement | engine | beta | `walk` on conformance |
| EN-12 | Callouts | engine | v0.1 | `walk fixtures` |
| EN-13 | Ghost cursor, ripple, keycaps, captions | engine | v0.1 | `walk fixtures` |
| EN-14 | Code panel: tabs, 21-line scroller, whole-line scroll, dimming | engine | v0.1 | `walk`, `walk a11y` |
| EN-15 | Excerpts with elision lines | engine | v0.1 | `check`, unit test |
| EN-16 | Off chip on enhancement-off steps | engine | v0.1 | `walk` |
| EN-17 | Splits 50/50 and 60/40, single slot | engine | v0.1 | `walk` geometry checks |
| EN-18 | Meters computed from real files | engine | v0.1 | `check` |
| EN-19 | Intro beat: still, description, support row, also-uses line | engine | v0.1 | `walk` intro checks |
| EN-20 | Support from `web-features`, tools from npm | engine | v0.1 | Unit test |
| EN-21 | Group chip and drawer grouping | engine | beta | `walk drawer` |
| EN-22 | Backgrounds per slide and section, frame alignment | engine | beta | `walk` frame background check |

## Frames

| ID | Capability | Target | Phase | Proving check |
|---|---|---|---|---|
| FR-1 | Composer: shown markup byte for byte, in a shell | engine | v0.1 | Snapshot test |
| FR-2 | Frame on a separate origin, checked in both directions | engine | v0.1 | `walk` protocol watch |
| FR-3 | CSP per document, `frame-ancestors`, per-build override | engine | v0.1 | `parity frames` |
| FR-4 | `csp-enforce` and report-only mode | engine | beta | `walk` on conformance |
| FR-5 | Sandbox per build | engine | v0.1 | `parity frames` |
| FR-6 | `enhance-css` modes: all, files, supports-blocks | engine | v0.1 | `walk` on conformance |
| FR-7 | `enhance-js` removes scripts on reload | engine | v0.1 | `walk` on conformance |
| FR-8 | Multi-page builds, `Step.route`, view transitions | engine | beta | `walk`, `axe` on conformance |
| FR-9 | Server templates through `render` | engine | beta | `walk` on conformance |
| FR-10 | Demo server routes | engine | v0.1 | `walk` on conformance |
| FR-11 | Inner documents | engine | beta | `walk` on conformance |
| FR-12 | Frame shells: before, after, `outside`, `scrolls`, stylesheets | engine | beta | `walk` shell checks |
| FR-13 | Per-demo CSS in `manifest.styles` | engine | beta | `walk` on conformance |
| FR-14 | Static frames | engine | v0.1 | `walk` |
| FR-15 | Terminal frames, recordings, status chip, example lines | engine | v0.1 | `walk` on the starter |
| FR-16 | `l` live mode hides the recording | engine | v0.1 | `walk keys` |
| FR-17 | External frames on their own origin | engine, @live-ish/bridge | beta | `walk` on `examples/server` |
| FR-18 | External app bridge: runtime, hooks, frame session | @live-ish/bridge | beta | `walk` on `examples/server` |
| FR-19 | Poster with a note when an external origin is unset | engine | beta | `walk` with the server down |
| FR-20 | Starting companion servers for dev, capture and present | engine | beta | `parity frames` |
| FR-21 | FrameWarm, never taking focus | engine | v0.1 | `walk focus` |
| FR-22 | Poster underlay and swap | engine | v0.1 | `walk underlay` |
| FR-23 | "Demo frame did not answer" after 1500 ms | engine | v0.1 | Conformance test with a blocked frame |
| FR-24 | Asset versioning and per-class cache headers | engine | v0.1 | `perf headers` |

## Reader view

| ID | Capability | Target | Phase | Proving check |
|---|---|---|---|---|
| RD-1 | Control pill, idle fade, wake on input | engine | v0.1 | `walk a11y` |
| RD-2 | Live frames for readers, Tab passes them | engine | v0.1 | `walk keys` |
| RD-3 | "Try the demo" toggle | engine | v0.1 | `walk a11y` |
| RD-4 | Text view at small sizes and by toggle | engine | v0.1 | `walk a11y` |
| RD-5 | No frames load in text view | engine | v0.1 | `walk a11y` |
| RD-6 | APG tabs on the code panel | engine | v0.1 | `walk a11y` |
| RD-7 | Step announcements, one live region | engine | v0.1 | `walk a11y` |
| RD-8 | Focus survives a slide change | engine | v0.1 | `walk a11y` |
| RD-9 | Highlighted lines as text for screen readers | engine | v0.1 | `walk a11y` |
| RD-10 | Link focus and new-tab wording | engine | v0.1 | `walk links` |
| RD-11 | Notes in the text view | engine | v0.1 | Default differs, exception E-4 |

## SEO and sharing

| ID | Capability | Target | Phase | Proving check |
|---|---|---|---|---|
| SE-1 | Titles, descriptions, canonical URLs | engine | v0.1 | `parity seo` |
| SE-2 | Open Graph and Twitter cards | engine | v0.1 | `parity seo` |
| SE-3 | Hashed share image, versioned URL | verify | v0.1 | `og`, `check` |
| SE-4 | JSON-LD for talk, speaker, session and slide | engine | v0.1 | `parity seo` |
| SE-5 | Sitemap | engine | v0.1 | `parity seo` |
| SE-6 | Host-aware robots with preview-bot group | engine | v0.1 | `parity seo` |
| SE-7 | `noindex` on windows, `X-Robots-Tag` on the frames host | engine | v0.1 | `parity seo` |
| SE-8 | Outbound link tagging | engine | v0.1 | `parity seo` |
| SE-9 | Footer site link, wordmark, name link | engine | v0.1 | `walk links` |
| SE-10 | QR code on the closing slide, offline | engine | v0.1 | `walk deck` |

## Validators

| ID | Capability | Target | Phase | Proving check |
|---|---|---|---|---|
| VA-1 | `page-order`, `step-cap`, `bullets`, `bullet-length`, `step-words`, `budget`, `proof`, `key-step`, `label`, `keyboard`, `frame-change`, `duration`, `intro`, `intro-sentences`, `eyebrow`, `cautions`, `callouts` | engine | v0.1 | Unit test (one broken fixture per rule) |
| VA-2 | `code`, `files`, `file-size`, `excerpt`, `selector`, `via`, `flags`, `viewport`, `build`, `meter`, `support`, `todo` | engine | v0.1 | Unit test (one broken fixture per rule) |
| VA-3 | `dash`, `exclaim`, `case`, `slide-case`, `banned`, `sentence`, `x-not-y` | engine | v0.1 | Unit test (one broken fixture per rule), E-6 on the default |
| VA-4 | `seo-title`, `seo-description`, `jsonld`, `og-image`, `og-stale`, `event-date` | engine | v0.1 | Unit test (one broken fixture per rule) |
| VA-5 | `images`, `public-files`, `poster-fresh`, `fonts`, `deck-links`, `nav`, `theme`, `theme-lint` | engine | v0.1 | Unit test (one broken fixture per rule) |
| VA-6 | `wrapper-banned`, `wrapper-lint`, `wrapper-markup`, `wrapper-missing`, `wrapper-shown`, `wrapper-unknown` | engine | beta | Unit test (one broken fixture per rule) |
| VA-7 | `bg-missing`, `bg-unknown`, `bg-unused`, `bg-shared`, `bg-file`, `bg-size`, `bg-bytes`, `bg-duplicate`, `bg-stats` | engine | beta | Unit test (one broken fixture per rule) |
| VA-8 | `group` | engine | beta | Unit test (one broken fixture per rule) |
| VA-9 | `timing` | engine | v0.1 | Unit test (one broken fixture per rule) |

## Walks and accessibility checks

| ID | Capability | Target | Phase | Proving check |
|---|---|---|---|---|
| WK-1 | `walk`: steps, asserts, digests, speaker window | verify | v0.1 | Self-test on a broken fixture |
| WK-2 | `walk deck`: backgrounds, footers, closing | verify | v0.1 | Self-test on a broken fixture |
| WK-3 | `walk --mode=advance` | verify | v0.1 | Self-test on a broken fixture |
| WK-4 | `walk transitions` | verify | beta | Self-test on a broken fixture |
| WK-5 | `walk drawer` | verify | v0.1 | Self-test on a broken fixture |
| WK-6 | `walk links` | verify | v0.1 | Self-test on a broken fixture |
| WK-7 | `walk fixtures`, spotlight checks | verify | v0.1 | Self-test on a broken fixture |
| WK-8 | `walk focus` | verify | v0.1 | Self-test on a broken fixture |
| WK-9 | `walk underlay` | verify | v0.1 | Self-test on a broken fixture |
| WK-10 | `walk keys` | verify | v0.1 | Self-test on a broken fixture |
| WK-11 | `walk a11y` | verify | beta | Self-test on a broken fixture |
| WK-12 | Frame shell checks | verify | beta | Self-test on a broken fixture |
| WK-13 | `--browser`, `--channel`, `--headed`, `--no-speaker`, `--capture` | verify | v0.1 | Self-test on a broken fixture |
| WK-14 | `--without=<switch>`, a run with a flag removed | verify | beta | Self-test on a broken fixture |
| WK-15 | `axe` for frames at first and last step | verify | v0.1 | 0 violations on examples |
| WK-16 | `axe --presenter` | verify | v0.1 | 0 violations on examples |
| WK-17 | `test:contrast` | verify | v0.1 | Runs per theme |

## Capture and generated assets

| ID | Capability | Target | Phase | Proving check |
|---|---|---|---|---|
| CP-1 | `capture`: production build beside `dev` | verify | v0.1 | `capture`, then `check` |
| CP-2 | `capture`: stills and step posters | verify | v0.1 | `capture`, then `check` |
| CP-3 | `images`: AVIF, WebP, content hashes, manifest | engine | v0.1 | `check` (`images`) |
| CP-4 | Poster freshness hash | engine | v0.1 | `check` (`poster-fresh`) |
| CP-5 | Capture in a named browser channel | verify | beta | `capture` on conformance |
| CP-6 | Chromium launch switches | verify | beta | `capture` on conformance |
| CP-7 | Capture with companion servers | verify | beta | `capture` on `examples/server` |
| CP-8 | `fonts`: subsets, write-once folder, coverage | engine | v0.1 | `fonts --check` |
| CP-9 | `support` and `support --tools` | engine | v0.1 | Unit test |
| CP-10 | `meters` | engine | v0.1 | `check` (`meter`) |
| CP-11 | Excerpts of a shown file | engine | v0.1 | Unit test |
| CP-12 | `backgrounds`: text zones | verify | beta | `check` (`bg-stats`) |
| CP-13 | Grain texture | engine | v0.1 | Unit test |
| CP-14 | `gen:themes` and the `theme-lint` rule | engine | v0.1 | `check` (`theme`) |
| CP-15 | Terminal recording and token scan | verify | v0.1 | `record` on the starter |

## Warm-up

| ID | Capability | Target | Phase | Proving check |
|---|---|---|---|---|
| WU-1 | `warmup`: pages, frames, files, per-class TTFB | verify | beta | `warmup` against `next start` |
| WU-2 | Build check through `--expect` | verify | beta | Fails on a wrong build ID |
| WU-3 | `--demo`, `--concurrency` | verify | beta | Fails on a wrong build ID |
| WU-4 | Stage-day checklist | Docs | beta | Link check, one rehearsal |

## Perf and budgets

| ID | Capability | Target | Phase | Proving check |
|---|---|---|---|---|
| PF-1 | `perf load`: TTFB, FCP, LCP, CLS, blocking time, hydration, requests, bytes | verify | beta | The task writes a result file on `next start` |
| PF-2 | `perf nav`: Key to paint, background, still and frame | verify | beta | The task writes a result file on `next start` |
| PF-3 | `perf frame`: Back replays and requests per mount | verify | beta | The task writes a result file on `next start` |
| PF-4 | `perf walk`: Whole deck, cold then warm, `--offline` | verify | beta | The task writes a result file on `next start` |
| PF-5 | `perf headers`: Caching rules, both origins | verify | beta | The task writes a result file on `next start` |
| PF-6 | `perf lighthouse`: Desktop and mobile | verify | beta | The task writes a result file on `next start` |
| PF-7 | `perf functions`: Traced size per route | verify | beta | The task writes a result file on `next start` |
| PF-8 | Profiles `none`, `venue`, `poor`, `--label`, result files | verify | beta | The task writes a result file on `next start` |
| PF-9 | Budgets file and CI gate | verify | beta | The task writes a result file on `next start` |

## Other tooling

| ID | Capability | Target | Phase | Proving check |
|---|---|---|---|---|
| OT-1 | Analytics, reader pages only, off under automation | engine | v0.1 | `parity seo`, default differs (E-7) |
| OT-2 | Speed Insights, reader pages only | engine | v0.1 | `parity seo`, default differs (E-7) |
| OT-3 | Local fallback build with production origins | engine, present | v0.1 | `walk --local-only` |
| OT-4 | `eslint-plugin-local` | This repo only | v0.1 | CI lint |
| OT-5 | `live-ish check` runs every rule as one command | engine | v0.1 | CI |

## Exceptions

An exception is a deliberate gap or a default that differs from what a row might suggest. `approved-pending-owner` means the recommendation is the default until the repository owner signs the table below.

| ID | Exception | Kind | Reason | Recommendation | Status | Rows |
|---|---|---|---|---|---|---|
| E-1 | Support tiles show vendor names as text, not logos | Differs | Trademarks. The project ships no vendor logos. | Approve. | approved-pending-owner |  |
| E-2 | Full static hosting | Not in the repo | A static host cannot run frames. A reader-only export can. | Approve. `live-ish export` writes the reader-only site. | approved-pending-owner |  |
| E-3 | `/present` and `/speaker` off on deployed hosts by default | Default differs | Prerendered notes would be public by default. | Approve. `presenter.onHost: true` restores it. | approved-pending-owner |  |
| E-4 | Notes hidden in the reader text view by default | Default differs | Prerendered notes would be public by default. | Approve. `reader.notes: true` restores it. | approved-pending-owner | RD-11 |
| E-5 | One origin when deployed, unless `hosts.frames` is set | Default differs | Most users have one domain. Two hosts stay supported. | Approve. | approved-pending-owner |  |
| E-6 | Writing rules off by default | Default differs | Style is the author's choice, so a deck opts in. | Approve. `preset: "plain"` restores them. | approved-pending-owner | VA-3 |
| E-7 | Analytics and Speed Insights off by default | Default differs | No tracking without consent. | Approve. | approved-pending-owner | OT-1, OT-2 |
| E-14 | PDF export | Not in the repo | Not built. The reader view and the text view cover a deck after the talk. | v1.1 candidate, built on posters. | approved-pending-owner |  |
| E-15 | Video export and recording | Not in the repo | A different product. | Stay out. | approved-pending-owner |  |
| E-16 | Cross-device remote control | Not in the repo | Sync is one browser on one machine. | Post v1.0 candidate. | approved-pending-owner |  |
| E-17 | Markdown authoring | Not in the repo | Validators depend on typed data. | Stay out. Notes keep light markdown. | approved-pending-owner |  |
| E-18 | A visual editor and a plugin marketplace | Not in the repo | No first user needs them. | Stay out. | approved-pending-owner |  |
| E-19 | Non-16:9 canvases | Not in the repo | The stage is a fixed 1920 by 1080 canvas. | Stay out. | approved-pending-owner |  |
| E-20 | A `custom` layout for deck-owned React slides | Not in the repo | Not built. A slide is data today. | v1.1 candidate. | approved-pending-owner |  |
| E-21 | Hosted service, accounts and telemetry | Not in the repo | Conflicts with the project's values. | Stay out. | approved-pending-owner |  |
| E-22 | PTY capture in `record` | Not in the repo | `record` runs commands without a PTY, and `node-pty` is not a dependency. | Approve. Add a PTY later only if demos need it. | approved-pending-owner |  |

## Sign-off

For the repository owner. Left blank on purpose.

| Exception | Decision | Date |
|---|---|---|
| E-1 | | |
| E-2 | | |
| E-3 | | |
| E-4 | | |
| E-5 | | |
| E-6 | | |
| E-7 | | |
| E-14 | | |
| E-15 | | |
| E-16 | | |
| E-17 | | |
| E-18 | | |
| E-19 | | |
| E-20 | | |
| E-21 | | |
| E-22 | | |
