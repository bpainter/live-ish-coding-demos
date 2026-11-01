# Parity matrix

Generated from `parity/matrix.json` by `parity/render.mjs`. Do not edit.

205 capabilities, 40 of them proved by `live-ish parity`. Every other row names the tool that proves it.

## Routes

| ID | Capability | Source | Target | Phase | Proving check |
|---|---|---|---|---|---|
| RT-1 | `/` renders slide 1, then moves to `/s/<id>` | `app/page.tsx` | engine | v0.1 | `parity routes` |
| RT-2 | `/s/<id>`, prerendered per slide | `app/s/[id]/page.tsx` | engine | v0.1 | `parity routes` |
| RT-3 | `/s/<n>` redirects to slide n | `app/s/[id]/page.tsx` | engine | v0.1 | `parity routes` |
| RT-4 | `/present?s=<id>`, rewritten to a prerendered page | `next.config.ts`, `app/present/[id]/page.tsx` | engine | v0.1 | `parity routes` |
| RT-5 | `/speaker?s=<id>`, rewritten to a prerendered page | `next.config.ts`, `app/speaker/[id]/page.tsx` | engine | v0.1 | `parity routes` |
| RT-6 | Bare or malformed `s` lands on the first slide | `next.config.ts` | engine | v0.1 | `parity routes` |
| RT-7 | Unknown id: first slide in the windows, 404 for readers | `app/present/[id]/page.tsx`, `app/s/[id]/page.tsx` | engine | v0.1 | `parity routes` |
| RT-8 | `/_health` names the build, slides and pages | `app/%5Fhealth/route.ts` | engine | v0.1 | `parity routes` |
| RT-9 | Custom 404 page | `app/not-found.tsx` | engine | v0.1 | `parity routes` |
| RT-10 | Frame documents and build files at `/demos/<demo>/<build>` | `app/demos/[demo]/[build]/[[...path]]/route.ts` | engine | v0.1 | `parity frames` |
| RT-11 | Root-level addresses a demo declares, so shown code uses real paths | `app/<address>` | engine | beta | `parity frames` on the conformance deck |
| RT-12 | Spotlight fixture, development only | `app/fixtures/spotlight/` | examples/conformance | v0.1 | `walk fixtures` |
| RT-13 | `?step=`, `?step=last`, `?glass=`, `?capture=1`, `?fade=`, `?rehearse=1`, kept across slides | `lib/presenter/url.ts` | engine | v0.1 | `parity routes` |

## Keys

| ID | Capability | Source | Target | Phase | Proving check |
|---|---|---|---|---|---|
| KY-1 | Right arrow, PageDown, Space: Next step, then next page | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-2 | Left arrow, PageUp, Backspace: Back one step, then previous page | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-3 | Shift with an arrow: Next or previous page, step 0 | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-4 | Home, End: First or last slide | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-5 | `b`, `.`: Blank | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-6 | `f`: Fullscreen | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-7 | `h`: Hands-on mode | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-8 | `l`: Terminal page: hide the recording for a live terminal | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-9 | `r`: Reset and replay the step | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-10 | `t`: Start or pause the timer | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-11 | `d`: Rehearsal overlay and action summaries | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-12 | `o`: Open the frame standalone | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-13 | `s`: Open or focus the other window | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-14 | `g`: Speaker: go to a slide number | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-15 | `?`: Keyboard help | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-16 | Escape: Closes overlays; forwarded from frames | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-17 | F5: Reserved, no deck action | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-18 | Reader scoping: Presenter keys off, letters act only from the stage | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-19 | Keys forwarded from a focused frame: Clicker keys work with focus in a frame | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |
| KY-20 | Space and Enter on a focused control: Presses it in reader and speaker windows | `lib/keys.ts`, `components/stage/Stage.tsx` | engine | v0.1 | `walk keys` |

## Presenter behaviors

| ID | Capability | Source | Target | Phase | Proving check |
|---|---|---|---|---|---|
| PR-1 | Two-window sync over `BroadcastChannel`, `localStorage` fallback | `lib/presenter/transport.ts` | engine | v0.1 | `walk` speaker checks |
| PR-2 | A refresh resumes; a typed `?s=` wins on a navigate load | `lib/presenter/context.tsx` | engine | v0.1 | `parity presenter` |
| PR-3 | Build ID in the channel name | `lib/presenter/types.ts` | engine | v0.1 | `parity presenter` |
| PR-4 | Presence: "No audience" pill and coral dot | `lib/presenter/context.tsx`, `SpeakerView.tsx` | engine | v0.1 | `parity presenter` |
| PR-5 | Speaker layout: previews, next panel, steps block, notes, footer | `components/presenter/SpeakerView.tsx`, `styles/components/speaker.css` | engine | v0.1 | `walk` speaker checks |
| PR-6 | One status pill with six states | `SpeakerView.tsx` | engine | v0.1 | `parity presenter` |
| PR-7 | Notes rendering: paragraphs, quotes, lists, code, bold, directions | `lib/notes.ts`, `NotesText.tsx` | engine | v0.1 | Unit test |
| PR-8 | Notes size 28 to 56 px, remembered | `SpeakerView.tsx` | engine | v0.1 | `parity presenter` |
| PR-9 | References: support, sources, jump to step, actions | `SpeakerView.tsx` | engine | v0.1 | `parity presenter` |
| PR-10 | Cautions on the last step, `ifKeyboard` box in hands-on | `SpeakerView.tsx` | engine | v0.1 | `walk` |
| PR-11 | Timer: elapsed, over or under, pause, reset, synced | `Timer.tsx` | engine | v0.1 | `parity presenter` |
| PR-12 | `?rehearse=1` log and JSON export | `SpeakerView.tsx` | engine | v0.1 | `parity presenter` |
| PR-13 | Rehearsal overlay: step, digest, duration, asserts, p95 frame time | `Stage.tsx` | engine | v0.1 | `parity presenter` |
| PR-14 | Section drawer with its keyboard contract | `components/chrome/NavDrawer.tsx`, `lib/nav.ts` | engine | v0.1 | `walk drawer` |
| PR-15 | Go-to dialog | `components/chrome/GotoDialog.tsx` | engine | v0.1 | `parity presenter` |
| PR-16 | Keyboard help, filtered by mode | `components/chrome/KeyboardHelp.tsx` | engine | v0.1 | `walk a11y` |
| PR-17 | Blank, with flag and outline on the preview | `Stage.tsx`, `SpeakerView.tsx` | engine | v0.1 | `parity presenter` |
| PR-18 | Hands-on mode and its replay on exit | `Stage.tsx`, `PageFrame.tsx` | engine | v0.1 | `walk` |
| PR-19 | Wake lock, cursor hidden after 2 s | `AudienceView.tsx` | engine | v0.1 | `parity presenter` |
| PR-20 | Grain overlay, audience window only | `Stage.tsx`, `lib/grain.ts` | engine | v0.1 | `parity presenter` |
| PR-21 | Neighbor images decoded ahead | `SlidePage.tsx`, `Stage.tsx` | engine | v0.1 | `perf nav` |
| PR-22 | RSC prefetch of neighbors | `Stage.tsx`, `lib/presenter/url.ts` | engine | v0.1 | `perf nav` |
| PR-23 | Crossfade between slides | `styles/components/stage-transition.css` | engine | v0.1 | `walk transitions` |
| PR-24 | `?glass=off`, solid surfaces everywhere | `GlassMode.tsx`, `lib/frames/origins.ts` | engine | v0.1 | `parity presenter` |
| PR-25 | Open frame, audience window controls | `SpeakerView.tsx` | engine | v0.1 | `walk keys` |
| PR-26 | Posters in speaker previews | `PageBody.tsx` | engine | v0.1 | `walk` speaker checks |
| PR-27 | Stuck-playback watchdog at 1500 ms | `PageFrame.tsx`, `Stage.tsx` | engine | v0.1 | `walk --mode=advance` |
| PR-28 | Audience focus claim on arrival | `Stage.tsx` | engine | v0.1 | `walk focus` |
| PR-29 | Window titles per slide | `lib/presenter/titles.ts` | engine | v0.1 | `parity presenter` |
| PR-30 | Dark speaker fallbacks: reduced transparency, forced colors, reduced motion | `styles/components/speaker.css` | engine | v0.1 | `parity presenter` |

## Demo engine actions

| ID | Capability | Source | Target | Phase | Proving check |
|---|---|---|---|---|---|
| AC-1 | `pointer`: Ghost cursor glides to an element | `public/runtime/demo-runtime.js`, `content/demo-schema.ts` | engine | v0.1 | `walk` on a conformance page for that action |
| AC-2 | `click`: Cursor, ripple, real click, link wait in multi-page builds | `public/runtime/demo-runtime.js`, `content/demo-schema.ts` | engine | v0.1 | `walk` on a conformance page for that action |
| AC-3 | `key`: Keycap, then the named DOM effect in `via` | `public/runtime/demo-runtime.js`, `content/demo-schema.ts` | engine | v0.1 | `walk` on a conformance page for that action |
| AC-4 | `focus`: Focus, with optional visible ring | `public/runtime/demo-runtime.js`, `content/demo-schema.ts` | engine | v0.1 | `walk` on a conformance page for that action |
| AC-5 | `type`: Character-by-character input | `public/runtime/demo-runtime.js`, `content/demo-schema.ts` | engine | v0.1 | `walk` on a conformance page for that action |
| AC-6 | `paste`: Value set, input event, "Paste" caption | `public/runtime/demo-runtime.js`, `content/demo-schema.ts` | engine | v0.1 | `walk` on a conformance page for that action |
| AC-7 | `resize`: Animates a container, or the frame through `:viewport` | `public/runtime/demo-runtime.js`, `content/demo-schema.ts` | engine | v0.1 | `walk` on a conformance page for that action |
| AC-8 | `toggle`: Flips an enhancement flag, reloading where the flag needs it | `public/runtime/demo-runtime.js`, `content/demo-schema.ts` | engine | v0.1 | `walk` on a conformance page for that action |
| AC-9 | `navigate`: URL, back or forward, inside the frame | `public/runtime/demo-runtime.js`, `content/demo-schema.ts` | engine | v0.1 | `walk` on a conformance page for that action |
| AC-10 | `network`: Slow or fast, through the `setNetwork` hook, with a caption | `public/runtime/demo-runtime.js`, `content/demo-schema.ts` | engine | v0.1 | `walk` on a conformance page for that action |
| AC-11 | `hook`: Calls a named `window.demoHooks` function | `public/runtime/demo-runtime.js`, `content/demo-schema.ts` | engine | v0.1 | `walk` on a conformance page for that action |
| AC-12 | `terminal`: Reveals a range of recorded lines | `public/runtime/demo-runtime.js`, `content/demo-schema.ts` | engine | v0.1 | `walk` on a conformance page for that action |
| AC-13 | `reveal`: Shows a hidden element | `public/runtime/demo-runtime.js`, `content/demo-schema.ts` | engine | v0.1 | `walk` on a conformance page for that action |
| AC-14 | `wait`: Pauses; skipped or settled during replay | `public/runtime/demo-runtime.js`, `content/demo-schema.ts` | engine | v0.1 | `walk` on a conformance page for that action |
| AC-15 | `assert`: The full grammar: `:selector`, `focused`, `visible`, `hidden`, `count=`, `value-length`, `inline-size`, `text~=`, `contains:`, `attr:`, `no-attr:`, `url=`, `style:`, `columns=` and the rest of `evaluate()` | `public/runtime/demo-runtime.js`, `content/demo-schema.ts` | engine | v0.1 | `walk` on a conformance page for that action |

## Demo engine behaviors

| ID | Capability | Source | Target | Phase | Proving check |
|---|---|---|---|---|---|
| EN-1 | Three beats plus `single` pages | `content/demo-schema.ts` | engine | v0.1 | `check`, `walk` |
| EN-2 | A section mixing frame kinds across beats | `content/sections/*` | engine | v0.1 | `walk` on conformance |
| EN-3 | Code lead of 400 ms, a press during it finishes the step | `PageFrame.tsx` | engine | v0.1 | `walk --mode=advance` |
| EN-4 | Next during playback finishes the step | `PageFrame.tsx`, `lib/engine/frame.ts` | engine | v0.1 | `walk --mode=advance` |
| EN-5 | Deterministic Back: fresh document, instant replay, digest | `lib/engine/steps.ts` | engine | v0.1 | `walk` |
| EN-6 | Reloading flags split a step | `lib/engine/steps.ts` | engine | v0.1 | `walk` |
| EN-7 | Frame history guard, Safari focus relay | `lib/engine/input-relay.ts`, `demo-runtime.js` | engine | v0.1 | `walk --browser=webkit` |
| EN-8 | Spotlights: radii, merge, inset mode | `Overlay.tsx` | engine | v0.1 | `walk fixtures` |
| EN-9 | Settle gate and forced show at 2000 ms | `lib/engine/settle.ts` | engine | v0.1 | `test:settle`, `walk fixtures` |
| EN-10 | Top-layer holes in spotlights | `Overlay.tsx`, `lib/engine/protocol.ts` | engine | v0.1 | `walk fixtures` |
| EN-11 | `spotlightClip` and keycap placement | `content/demo-schema.ts`, `Overlay.tsx` | engine | beta | `walk` on conformance |
| EN-12 | Callouts | `Overlay.tsx` | engine | v0.1 | `walk fixtures` |
| EN-13 | Ghost cursor, ripple, keycaps, captions | `Overlay.tsx` | engine | v0.1 | `walk fixtures` |
| EN-14 | Code panel: tabs, 21-line scroller, whole-line scroll, dimming | `PageCodePanel.tsx` | engine | v0.1 | `walk`, `walk a11y` |
| EN-15 | Excerpts with elision lines | `lib/excerpt.ts`, `lib/demo-files.ts` | engine | v0.1 | `check`, unit test |
| EN-16 | Off chip on enhancement-off steps | `PageCodePanel.tsx` | engine | v0.1 | `walk` |
| EN-17 | Splits 50/50 and 60/40, single slot | `content/demo-schema.ts` | engine | v0.1 | `walk` geometry checks |
| EN-18 | Meters computed from real files | `scripts/meters.mts`, `lib/meters.ts` | engine | v0.1 | `check` |
| EN-19 | Intro beat: still, description, support row, also-uses line | `IntroSlide.tsx`, `SupportRow.tsx` | engine | v0.1 | `walk` intro checks |
| EN-20 | Support from `web-features`, tools from npm | `lib/support-data.ts` | engine | v0.1 | `test:support` |
| EN-21 | Group chip and drawer grouping | `IntroSlide.tsx`, `lib/nav.ts` | engine | beta | `walk drawer` |
| EN-22 | Backgrounds per slide and section, frame alignment | `content/backgrounds.ts`, `lib/frames/compose.ts` | engine | beta | `walk` frame background check |

## Frames

| ID | Capability | Source | Target | Phase | Proving check |
|---|---|---|---|---|---|
| FR-1 | Composer: shown markup byte for byte, in a shell | `lib/frames/compose.ts` | engine | v0.1 | Snapshot test |
| FR-2 | Frame on a separate origin, checked in both directions | `lib/engine/frame.ts`, `demo-runtime.js` | engine | v0.1 | `walk` protocol watch |
| FR-3 | CSP per document, `frame-ancestors`, per-build override | `lib/frames/compose.ts` | engine | v0.1 | `parity frames` |
| FR-4 | `csp-enforce` and report-only mode | `lib/frames/compose.ts` | engine | beta | `walk` on conformance |
| FR-5 | Sandbox per build | `lib/frames/build-helpers.ts` | engine | v0.1 | `parity frames` |
| FR-6 | `enhance-css` modes: all, files, supports-blocks | `lib/frames/compose.ts`, `demo-runtime.js` | engine | v0.1 | `walk` on conformance |
| FR-7 | `enhance-js` removes scripts on reload | `lib/frames/compose.ts` | engine | v0.1 | `walk` on conformance |
| FR-8 | Multi-page builds, `Step.route`, view transitions | `lib/frames/types.ts`, `lib/engine/steps.ts` | engine | beta | `walk`, `axe` on conformance |
| FR-9 | Server templates through `render` | `lib/frames/types.ts` | engine | beta | `walk` on conformance |
| FR-10 | Demo server routes | `lib/frames/routes.ts` | engine | v0.1 | `walk` on conformance |
| FR-11 | Inner documents | `lib/frames/inner.ts` | engine | beta | `walk` on conformance |
| FR-12 | Frame wrappers: before, after, `outside`, `scrolls`, stylesheets | `lib/frames/wrappers/*` | engine | beta | `walk-wrapper` checks |
| FR-13 | Per-demo CSS in `manifest.styles` | `lib/frames/compose.ts` | engine | beta | `walk` on conformance |
| FR-14 | Static frames | `lib/frames/build-helpers.ts` | engine | v0.1 | `walk` |
| FR-15 | Terminal frames, recordings, status chip, example lines | `build.ts`, `terminal/*` | engine | v0.1 | `walk` on the starter |
| FR-16 | `l` live mode hides the recording | `player.css`, `demo-runtime.js` | engine | v0.1 | `walk keys` |
| FR-17 | External frames on their own origin | `lib/frames/origins.ts` | engine, @live-ish/bridge | beta | `walk` on `examples/server` |
| FR-18 | External app bridge: runtime, hooks, frame session | `public/presenter.js`, `proxy.ts` | @live-ish/bridge | beta | `walk` on `examples/server` |
| FR-19 | Poster with a note when an external origin is unset | `PageBody.tsx`, `lib/frames/origins.ts` | engine | beta | `walk` with the server down |
| FR-20 | Starting companion servers for dev, capture and present | `package.json`, `scripts/capture.mts` | engine | beta | `parity frames` |
| FR-21 | FrameWarm, never taking focus | `FrameWarm.tsx` | engine | v0.1 | `walk focus` |
| FR-22 | Poster underlay and swap | `PageFrame.tsx` | engine | v0.1 | `walk underlay` |
| FR-23 | "Demo frame did not answer" after 1500 ms | `PageFrame.tsx` | engine | v0.1 | Conformance test with a blocked frame |
| FR-24 | Asset versioning and per-class cache headers | `next.config.ts`, `scripts/asset-versions.mts` | engine | v0.1 | `perf headers` |

## Reader view

| ID | Capability | Source | Target | Phase | Proving check |
|---|---|---|---|---|---|
| RD-1 | Control pill, idle fade, wake on input | `ReaderControls.tsx` | engine | v0.1 | `walk a11y` |
| RD-2 | Live frames for readers, Tab passes them | `PageFrame.tsx` | engine | v0.1 | `walk keys` |
| RD-3 | "Try the demo" toggle | `ReaderControls.tsx` | engine | v0.1 | `walk a11y` |
| RD-4 | Text view at small sizes and by toggle | `ReadingView.tsx`, `TextViewBoot.tsx` | engine | v0.1 | `walk a11y` |
| RD-5 | No frames load in text view | `PageFrame.tsx` | engine | v0.1 | `walk a11y` |
| RD-6 | APG tabs on the code panel | `PageCodePanel.tsx` | engine | v0.1 | `walk a11y` |
| RD-7 | Step announcements, one live region | `lib/announce.ts` | engine | v0.1 | `walk a11y` |
| RD-8 | Focus survives a slide change | `lib/focus-restore.ts` | engine | v0.1 | `walk a11y` |
| RD-9 | Highlighted lines as text for screen readers | `lib/code-description.ts` | engine | v0.1 | `walk a11y` |
| RD-10 | Link focus and new-tab wording | `NewTabLink.tsx` | engine | v0.1 | `walk links` |
| RD-11 | Notes in the text view | `ReadingView.tsx` | engine | v0.1 | Default differs, exception E-4 |

## SEO and sharing

| ID | Capability | Source | Target | Phase | Proving check |
|---|---|---|---|---|---|
| SE-1 | Titles, descriptions, canonical URLs | `lib/seo.ts`, `content/descriptions.ts` | engine | v0.1 | `parity seo` |
| SE-2 | Open Graph and Twitter cards | `lib/seo.ts` | engine | v0.1 | `parity seo` |
| SE-3 | Hashed share image, versioned URL | `scripts/og.mts`, `lib/validate/seo.ts` | verify | v0.1 | `og`, `check` |
| SE-4 | JSON-LD for talk, speaker, session and slide | `lib/seo.ts` | engine | v0.1 | `parity seo` |
| SE-5 | Sitemap | `app/sitemap.ts` | engine | v0.1 | `parity seo` |
| SE-6 | Host-aware robots with preview-bot group | `app/robots.txt/route.ts` | engine | v0.1 | `parity seo` |
| SE-7 | `noindex` on windows, `X-Robots-Tag` on the frames host | `app/present/[id]/page.tsx`, `next.config.ts` | engine | v0.1 | `parity seo` |
| SE-8 | Outbound link tagging | `content/deck.ts`, `siteHref` | engine | v0.1 | `parity seo` |
| SE-9 | Footer site link, wordmark, name link | `GlassSlide.tsx`, `Wordmark.tsx` | engine | v0.1 | `walk links` |
| SE-10 | QR code on the closing slide, offline | `lib/qr.ts`, `scripts/qr.mts` | engine | v0.1 | `walk deck` |

## Validators

| ID | Capability | Source | Target | Phase | Proving check |
|---|---|---|---|---|---|
| VA-1 | `page-order`, `step-cap`, `bullets`, `bullet-length`, `step-words`, `budget`, `proof`, `key-step`, `label`, `keyboard`, `frame-change`, `duration`, `intro`, `intro-sentences`, `eyebrow`, `cautions`, `callouts` | `lib/validate/*` | engine | v0.1 | `test:validator` (one broken fixture per rule) |
| VA-2 | `code`, `files`, `file-size`, `excerpt`, `selector`, `via`, `flags`, `viewport`, `build`, `meter`, `support`, `todo` | `lib/validate/*` | engine | v0.1 | `test:validator` (one broken fixture per rule) |
| VA-3 | `dash`, `exclaim`, `case`, `slide-case`, `banned`, `sentence`, `x-not-y` | `lib/validate/*` | engine | v0.1 | `test:validator` (one broken fixture per rule), E-6 on the default |
| VA-4 | `seo-title`, `seo-description`, `jsonld`, `og-image`, `og-stale`, `event-date` | `lib/validate/*` | engine | v0.1 | `test:validator` (one broken fixture per rule) |
| VA-5 | `images`, `public-files`, `poster-fresh`, `fonts`, `deck-links`, `nav`, `theme`, `theme-lint` | `lib/validate/*` | engine | v0.1 | `test:validator` (one broken fixture per rule) |
| VA-6 | `wrapper-banned`, `wrapper-lint`, `wrapper-markup`, `wrapper-missing`, `wrapper-shown`, `wrapper-unknown` | `lib/validate/*` | engine | beta | `test:validator` (one broken fixture per rule) |
| VA-7 | `bg-missing`, `bg-unknown`, `bg-unused`, `bg-shared`, `bg-file`, `bg-size`, `bg-bytes`, `bg-duplicate`, `bg-stats` | `lib/validate/*` | engine | beta | `test:validator` (one broken fixture per rule) |
| VA-8 | `group` | `lib/validate/*` | engine | beta | `test:validator` (one broken fixture per rule) |
| VA-9 | `timing` | `lib/validate/*` | engine | v0.1 | `test:validator` (one broken fixture per rule) |
| VA-10 | `title`, `bg-adjacent`, `bg-frame`, `bg-glass`, `bg-leftover`, `qr`, `grain`, `theme-hash`, `tailwind`, `v3-field` | `lib/validate/*` | engine | None | Removed, exception E-8 |

## Walks and accessibility checks

| ID | Capability | Source | Target | Phase | Proving check |
|---|---|---|---|---|---|
| WK-1 | `walk`: steps, asserts, digests, speaker window | `scripts/walk-demos.mts` | verify | v0.1 | Self-test on a broken fixture |
| WK-2 | `walk deck`: backgrounds, footers, closing | `scripts/walk-deck.mts` | verify | v0.1 | Self-test on a broken fixture |
| WK-3 | `walk --mode=advance` | `scripts/walk-r7.mts` | verify | v0.1 | Self-test on a broken fixture |
| WK-4 | `walk transitions` | `scripts/walk-r7.mts` | verify | beta | Self-test on a broken fixture |
| WK-5 | `walk drawer` | `scripts/walk-r7.mts` | verify | v0.1 | Self-test on a broken fixture |
| WK-6 | `walk links` | `scripts/walk-r7.mts` | verify | v0.1 | Self-test on a broken fixture |
| WK-7 | `walk fixtures`, spotlight checks | `scripts/walk-spotlight.mts` | verify | v0.1 | Self-test on a broken fixture |
| WK-8 | `walk focus` | `scripts/walk-perf.mts` | verify | v0.1 | Self-test on a broken fixture |
| WK-9 | `walk underlay` | `scripts/walk-perf.mts` | verify | v0.1 | Self-test on a broken fixture |
| WK-10 | `walk keys` | `scripts/walk-perf.mts` | verify | v0.1 | Self-test on a broken fixture |
| WK-11 | `walk a11y` | `scripts/walk-a11y.mts` | verify | beta | Self-test on a broken fixture |
| WK-12 | Wrapper checks | `scripts/walk-wrapper.mts` | verify | beta | Self-test on a broken fixture |
| WK-13 | `--browser`, `--channel`, `--headed`, `--no-speaker`, `--capture` | `scripts/walk-demos.mts` | verify | v0.1 | Self-test on a broken fixture |
| WK-14 | `--no-lanes`, generalized to run with a flag removed | `scripts/walk-demos.mts` | verify | beta | Self-test on a broken fixture |
| WK-15 | `axe` for frames at first and last step | `scripts/axe-frames.mts` | verify | v0.1 | 0 violations on examples |
| WK-16 | `axe --presenter` | `scripts/axe-frames.mts` | verify | v0.1 | 0 violations on examples |
| WK-17 | `test:contrast` | `scripts/contrast-test.mts` | verify | v0.1 | Runs per theme |

## Capture and generated assets

| ID | Capability | Source | Target | Phase | Proving check |
|---|---|---|---|---|---|
| CP-1 | `capture`: production build beside `dev` | `scripts/capture.mts` | verify | v0.1 | `capture`, then `check` |
| CP-2 | `visuals`: stills and step posters | `scripts/visuals.mts` | verify | v0.1 | `capture`, then `check` |
| CP-3 | `images`: AVIF, WebP, content hashes, manifest | `scripts/images.mts`, `lib/assets.ts` | engine | v0.1 | `check` (`images`) |
| CP-4 | Poster freshness hash | `lib/validate/assets.ts` | engine | v0.1 | `check` (`poster-fresh`) |
| CP-5 | Capture in a named browser channel | `scripts/visuals.mts` | verify | beta | `capture` on conformance |
| CP-6 | Chromium launch switches | `scripts/visuals.mts` | verify | beta | `capture` on conformance |
| CP-7 | Capture with companion servers | `scripts/capture.mts` | verify | beta | `capture` on `examples/server` |
| CP-8 | `fonts`: subsets, write-once folder, coverage | `scripts/fonts.mts`, `lib/validate/fonts.ts` | engine | v0.1 | `fonts --check` |
| CP-9 | `support` and `support --tools` | `scripts/support-data.mts` | engine | v0.1 | `test:support` |
| CP-10 | `meters` | `scripts/meters.mts` | engine | v0.1 | `check` (`meter`) |
| CP-11 | `excerpt` helper | `scripts/excerpt.mts` | engine | v0.1 | Unit test |
| CP-12 | `backgrounds`: text zones | `scripts/background-stats.mts` | verify | beta | `check` (`bg-stats`) |
| CP-13 | `grain` | `scripts/grain.mts` | engine | v0.1 | Unit test |
| CP-14 | `theme:sync` and `theme:lint` | `scripts/theme.mts` | engine | v0.1 | `check` (`theme`) |
| CP-15 | Terminal recording and token scan | `scripts/record-terminal.mts` | verify | v0.1 | `record` on the starter |

## Warm-up

| ID | Capability | Source | Target | Phase | Proving check |
|---|---|---|---|---|---|
| WU-1 | `warmup`: pages, frames, files, per-class TTFB | `scripts/warmup.mts` | verify | beta | `warmup` against `next start` |
| WU-2 | Build check through `--expect` | `scripts/warmup.mts` | verify | beta | Fails on a wrong build ID |
| WU-3 | `--demo`, `--concurrency` | `scripts/warmup.mts` | verify | beta | Fails on a wrong build ID |
| WU-4 | Stage-day checklist | `docs/deploy.md` | Docs | beta | Link check, one rehearsal |

## Perf and budgets

| ID | Capability | Source | Target | Phase | Proving check |
|---|---|---|---|---|---|
| PF-1 | `perf load`: TTFB, FCP, LCP, CLS, blocking time, hydration, requests, bytes | `scripts/perf/*` | verify | beta | The task writes a result file on `next start` |
| PF-2 | `perf nav`: Key to paint, background, still and frame | `scripts/perf/*` | verify | beta | The task writes a result file on `next start` |
| PF-3 | `perf frame`: Back replays and requests per mount | `scripts/perf/*` | verify | beta | The task writes a result file on `next start` |
| PF-4 | `perf walk`: Whole deck, cold then warm, `--offline` | `scripts/perf/*` | verify | beta | The task writes a result file on `next start` |
| PF-5 | `perf headers`: Caching rules, both origins | `scripts/perf/*` | verify | beta | The task writes a result file on `next start` |
| PF-6 | `perf lighthouse`: Desktop and mobile | `scripts/perf/*` | verify | beta | The task writes a result file on `next start` |
| PF-7 | `perf functions`: Traced size per route | `scripts/perf/*` | verify | beta | The task writes a result file on `next start` |
| PF-8 | Profiles `none`, `venue`, `poor`, `--label`, result files | `scripts/perf/lib.mts` | verify | beta | The task writes a result file on `next start` |
| PF-9 | Budgets file and CI gate: New, built from `scripts/walk-perf.mts` limits | `scripts/perf/*` | verify | beta | The task writes a result file on `next start` |

## Other tooling

| ID | Capability | Source | Target | Phase | Proving check |
|---|---|---|---|---|---|
| OT-1 | Analytics, reader pages only, off under automation | `SiteAnalytics.tsx` | engine | v0.1 | `parity seo`, default differs (E-7) |
| OT-2 | Speed Insights, reader pages only | `SiteAnalytics.tsx` | engine | v0.1 | `parity seo`, default differs (E-7) |
| OT-3 | Local fallback build with production origins | `docs/deploy.md` | engine, present | v0.1 | `walk --local-only` |
| OT-4 | `eslint-plugin-local` | `eslint-plugin-local/` | Engine repo only | v0.1 | CI lint |
| OT-5 | `pnpm validate` as one command | `package.json` | engine, check --all | v0.1 | CI |

## Exceptions

`approved-pending-owner` means the recommendation is the default until the owner signs the table below.

| ID | Exception | Kind | Reason | Recommendation | Status | Rows |
|---|---|---|---|---|---|---|
| E-1 | Vendor logos on support tiles become text | Differs | Trademarks. `public/logos/` has no license record. | Approve. A deck can add its own logos through `support.logos`. | approved-pending-owner |  |
| E-2 | Static hosting | Not in the repo | See section 13.5. Full static hosting cannot run frames. A reader-only export can. | Build the reader-only export in v1.0 as `live-ish export`. | approved-pending-owner |  |
| E-3 | `/present` and `/speaker` off on deployed hosts by default | Default differs | Prerendered notes would be public by default. | Approve. `presenter.onHost: true` restores it. | approved-pending-owner |  |
| E-4 | Notes hidden in the reader text view by default | Default differs | Same. | Approve. `reader.notes: true` restores it. | approved-pending-owner | RD-11 |
| E-5 | One origin when deployed, unless `hosts.frames` is set | Default differs | Most users have one domain. Two hosts stay supported. | Approve. | approved-pending-owner |  |
| E-6 | Writing rules off by default | Default differs | Owner's request. | Approve. `preset: "plain"` restores them. | approved-pending-owner | VA-3 |
| E-7 | Analytics and Speed Insights off by default | Default differs | No tracking without consent. | Approve. | approved-pending-owner | OT-1, OT-2 |
| E-8 | Ten rules removed: `title`, `bg-adjacent`, `bg-frame`, `bg-glass`, `bg-leftover`, `qr`, `grain`, `theme-hash`, `tailwind`, `v3-field` | Removed | Each guards talk history, a hard-coded choice or a file now generated at build. | Approve. | approved-pending-owner | VA-10 |
| E-9 | One-time and talk tools not moved: `extract-prd`, `import-prd`, `measure-vite` | Removed | They served one PRD or one demo. | Approve. | approved-pending-owner |  |
| E-10 | The custom still composition for one slide | Removed | One slide's special case. A manual `visual.src` still covers it. | Approve. | approved-pending-owner |  |
| E-11 | Duplicate layouts merge: `title` into `title`, `close` into `closing`, `framework-grid` into `grid` | Merged | Two versions of one layout, one unstyled for the current look. | Approve. | approved-pending-owner |  |
| E-12 | Dead code deleted: `DemoView`, `Demo`, `CodeStep`, demo-grid types, `deck.targetMinutes`, `mirror`, `Mode "print"` | Removed | Nothing reads them. | Approve. | approved-pending-owner |  |
| E-13 | 1/2/3 demo views | Not in the repo | Removed at v4. Fixed splits replaced them. | Stay out. | approved-pending-owner |  |
| E-14 | PDF export | Not in the repo | The `print` route was never built. | v1.1 candidate, built on posters. | approved-pending-owner |  |
| E-15 | Video export and recording | Not in the repo | A different product. | Stay out. | approved-pending-owner |  |
| E-16 | Cross-device remote control | Not in the repo | Sync is one browser on one machine. | Post v1.0 candidate. | approved-pending-owner |  |
| E-17 | Markdown authoring | Not in the repo | Validators depend on typed data. | Stay out. Notes keep light markdown. | approved-pending-owner |  |
| E-18 | A visual editor and a plugin marketplace | Not in the repo | No first user needs them. | Stay out. | approved-pending-owner |  |
| E-19 | Non-16:9 canvases | Not in the repo | The stage is a fixed 1920 by 1080 canvas. | Stay out. | approved-pending-owner |  |
| E-20 | A `custom` layout for deck-owned React slides | Not in the repo | The old `designed` layout is gone. This would be its modern form. | v1.1 candidate. | approved-pending-owner |  |
| E-21 | Hosted service, accounts and telemetry | Not in the repo | Conflicts with the project's values. | Stay out. | approved-pending-owner |  |
| E-22 | PTY capture in `record` | Not in the repo | `scripts/record-terminal.mts` says `node-pty` was never installed. `record` runs commands without a PTY. | Approve. Add a PTY later only if demos need it. | approved-pending-owner |  |
| E-23 | The 15 store wrappers and portal CSS | Content | Talk content. The wrapper API moves. | Stays behind, per the brief. | approved-pending-owner |  |

## Sign-off

For the owner. Left blank on purpose.

| Exception | Decision | Date |
|---|---|---|
| E-1 | | |
| E-2 | | |
| E-3 | | |
| E-4 | | |
| E-5 | | |
| E-6 | | |
| E-7 | | |
| E-8 | | |
| E-9 | | |
| E-10 | | |
| E-11 | | |
| E-12 | | |
| E-13 | | |
| E-14 | | |
| E-15 | | |
| E-16 | | |
| E-17 | | |
| E-18 | | |
| E-19 | | |
| E-20 | | |
| E-21 | | |
| E-22 | | |
| E-23 | | |
