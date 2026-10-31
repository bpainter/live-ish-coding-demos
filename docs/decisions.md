# Decisions

Append only. One short entry per decision a future reader needs.

## Validators

- **`runChecks` is read-only.** It does not call `prepareDeck`. Meters and support are computed live, and a generated file is compared only when it exists. A deck that has never been built checks clean, and a bad `web-features` id reaches the author as a finding, not a crash. The one file it writes is `.live-ish/deck.gen.ts`, because that is how a deck's modules load.
- **Rules reach the raw config through a side table.** `RuleContext` stays as the shared contract has it. `facts(ctx)` in `lib/validate/context.ts` holds the author's input, keyed on the assembled deck, because the assembled deck reaches the client and should not carry `writing` or `checks`.
- **Three rule ids beyond the PRD list.** `config` (Integrity) turns a config error into a finding with a docs page. `hook` (Integrity) is the static hook check. `storage-clear` (Fit) is the `.clear()` warning. Every finding needs a stable id, and none of the existing ids fit.
- **`viewport` stays, narrowed.** The viewport derives from the split, so the rule now catches only a `split` no layout has and a `split` on a page with no code panel. The first of those would otherwise crash assembly.
- **`eyebrow` stays, redefined.** The eyebrow is now the demo's title by construction, so comparing them can never fail. The rule checks that the title fits one eyebrow line instead.
- **Two `seo-description` rules share one id.** The tier table puts it in Style with its length staying Fit, and a `Rule` has one tier, so there are two objects. `checks.rules` sets both.
- **Strict and explicit relaxing.** `--strict` raises every Fit warning, except a rule the deck relaxed by name in `checks.rules`. Otherwise `"warn"` would mean nothing under `--strict`. Style warnings, such as spoken notes, stay warnings.
- **A generated file that is absent is a pass.** `images`, `public-files`, `poster-fresh`, `og-image`, `og-stale`, `bg-stats` and `skills-stale` run only when their file exists. `.live-ish/` is git-ignored and rebuilt on every `dev` and `build`, and no poster or share image is a neutral state.
- **The intro's description allows two sentences.** One sentence was the old limit, but the printed `faq` demo uses two, and that demo is the API contract.
- **`seo` and `nav` have pure cores.** `lib/seo-core.ts` and `lib/nav-groups.ts` take the deck as an argument, so the rules run the code the pages run. `lib/seo.ts` and `lib/nav.ts` bind them to the injected deck, which only exists under a bundler.
- **`isDeckError()`, not `instanceof`.** A deck's modules load as CommonJS under tsx unless its package says `"type": "module"`, while the CLI loads as ESM, so one process can hold two copies of the error classes. The name survives that.
- **A hook check that cannot see everything stays quiet.** A spread in `demoHooks`, or a script loaded from outside the beat's folder, could define any name. `hook` is Integrity and cannot be turned off, so a guess there would be a false error with no way out.
- **The 60/40 wording on `file-size`.** The code card is narrower at 60/40 (704 px) than at 50/50 (880 px), so moving to 60/40 cannot fix a long line. The message says to wrap to 44 columns, the width that fits the 60/40 card, which keeps the advice true.
## Themes and copy layouts

- **Theme precedence is page, beat default, demo, deck.** Section 16.6 states it highest first, so a `chrome.beats` default beats a demo's own `chrome`. A page's own `chrome` beats both.
- **Generated theme CSS lives in `packages/engine/assets/chrome/`.** `prepareDeck` copies all ten to `public/live-ish/chrome/`, so `?chrome=<id>` needs no rebuild. The root layout links only themes the deck resolves to. `styles/chrome/` holds no raw color at all.
- **Fonts for previews.** `prepareDeck` copies a family only for themes the deck resolves to. `next dev` and `LIVE_ISH_ALL_FONTS=1` copy all five, so previews show real faces. A production `?chrome=` preview of an unused theme falls back to its system stack with no failed request. `LIVE_ISH_ALL_FONTS` is internal, like `NEXT_DIST_DIR`, for conformance runs.
- **`--fx-*` values are engine-private.** The 16.8 contract has no token for scanlines, the counter meter or the title glow, so a theme file picks from closed lists: `motion.effect` and `details`. The generator turns those into `--fx-*`. A theme still cannot add a look of its own.
- **`extends` on a theme file** names the base for missing values, default `glass`. Section 16.10 says missing tokens come from the base theme but prints no field for it.
- **Cards take the code panel's ink.** The contract has no "ink on card" token, and some themes need white ink on the backdrop and dark ink on a gray card. Intro panels, badges and status notes use `--chrome-code-ink` and `--chrome-code-comment` on `--chrome-card-surface`, and `test:contrast` checks those pairs at 4.5:1.
- **The frame base is neutral and solid.** `--glass-*` became `--frame-*`, and blur is gone from frames. `.glass-card` and the other helpers became `.frame-*`. A demo `background` can still show through an author's own translucent panes.
- **The code tab's selected state uses ink and a bar, not bold.** Mono 700 would add 8.9 KB to every demo page, and the state reads without it. Phosphor loads it because mono is its text face.
- **Atkinson Hyperlegible ships unmodified.** See `THIRD_PARTY.md`.
- **Copy slide fields are `light`, `dark` and `accent`.** They replace color-named fields. The stage sets `data-field`, so a layout never names a color.
- **One `.slide` block for every copy layout.** The old composed layouts each drew their own footer and panels. They now share `SlideShell`, and their classes moved from `.sg-*` to BEM under `.slide`, `.card`, `.quote` and so on. Any tool reading `.sg-*` needs the new names.
- **`chrome.copySlides` is parsed and not applied.** Section 16.6 defers it to v1.0 at the earliest.
- **`?chrome=` previews built-in ids.** A custom theme shows through its own config, not through a preview of an id the deck does not use.
- **Presenter chrome uses system fonts.** Anything outside the canvas once used the deck's sans, so hidden labels and the reader pill could pull Inter onto a demo page under a theme that does not use it. With system stacks, the font budget depends only on the theme.
- **Headings in the frame base keep a bottom margin, and terminal lines are 28 px.** A spotlight's 9 px band covered the neighboring text at the old sizes.
