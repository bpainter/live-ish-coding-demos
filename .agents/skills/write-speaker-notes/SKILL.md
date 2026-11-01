---
name: write-speaker-notes
description: Draft or tighten speaker notes for a slide, demo page or step in a Live-ish deck. Use when the user asks for notes, a script, or what to say, or wants existing notes shorter. Do not use to add a new slide or demo (use add-copy-slide, add-web-demo or add-terminal-demo), or to change what a slide shows on screen.
license: MIT
compatibility: Requires a Live-ish deck with schemaVersion 1.
metadata:
  live-ish-schema: "1"
---

# Write speaker notes

Run `live-ish` through the deck's package manager, such as `pnpm live-ish check`.

Speaker notes are the author's words. Ask before rewriting notes that exist. Show the change, and let the author take it or leave it.

1. Find the notes. A copy slide has `notes` in `slides/NN-name.ts`. A demo has `notes` on each page in `demos/<id>/demo.ts`, and `notes` on each step.
2. Read what the page shows at that moment, so the notes match the screen. Read the code the step highlights.
3. Draft in the speaker's voice: short sentences, said aloud, one idea per paragraph.
4. Run `live-ish check --json`. Fix each issue it reports. A browser claim needs a source, so run `live-ish support "<feature>" --json` and name a demo's `support`. Never state browser support in notes from memory.
5. Ask the author to review the draft.

## Where notes go

A page's or slide's `notes` is one string. A step's `notes` is a list, with one entry per paragraph.

```ts
notes: "Here is the old way.\n\nEach press plays one step.",
steps: [{ id: "s1", notes: ["The click handler reads the state.", "Then it flips it by hand."] }],
```

The string takes light markup:

| Write | To get |
|---|---|
| A blank line | A new paragraph |
| `> ` at the start of each line | A quotation |
| `- ` at the start of each line | A list |
| `` `code` `` | Code |
| `**bold**` | Emphasis |
| `*stage direction*` | A direction, not spoken |

## Limits

- A step takes 1 to 3 paragraphs. `s0` takes up to 3.
- A paragraph holds about 45 words at most, and a step about 70. A page's opening notes hold about 70.
- About 130 words is one minute. Keep `minutes` honest, since `check` adds them up against `timing.target`.
- `ifKeyboard` on a step says what to press by hand in hands-on mode.
- Write no TODO into a finished note. `check` reports it.

## Rules

- Use the public CLI and schema. Never write engine internals by hand.
- Run `live-ish check` before saying a task is done.
- Never state browser support without `live-ish support`.
- If `check` fails twice on the same issue, stop and report it.
