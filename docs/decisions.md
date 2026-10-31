# Decisions

Append only. One short entry per decision a future reader needs.

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
- **Headings in the frame base keep a bottom margin, and terminal lines are 28 px.** A spotlight's 9 px band covered the neighboring text at the old sizes.
