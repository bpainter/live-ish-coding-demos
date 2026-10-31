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
