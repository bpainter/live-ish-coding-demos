---
name: add-copy-slide
description: Add a copy slide to a Live-ish deck, in any layout, such as content, title, quotes, stat, table or closing. Use when the user wants a slide of text, an image, a list, a quote, a number or a table. Do not use for a slide that plays a real page in a frame (use add-web-demo), for commands and their output (use add-terminal-demo), or to change only the notes on a slide that exists (use write-speaker-notes).
license: MIT
compatibility: Requires a Live-ish deck with schemaVersion 1.
metadata:
  live-ish-schema: "1"
---

# Add a copy slide

Run `live-ish` through the deck's package manager, such as `pnpm live-ish check`.

1. Pick a layout. `content` is the default. For the fields of each, read references/layouts.md.
2. Run `live-ish new copy "<title>" --layout <layout> --json`. Read the path it prints. It adds the id to `order` in `deck.config.ts`, ahead of a closing slide.
3. Edit that file. Replace every placeholder with the user's content.
4. To add an image, put the file under `public/images/` and set `image` with a real `alt`. Describe what the image shows. Never leave `alt` empty.
5. Add notes the speaker can say. Ask the user to review them.
6. To move the slide, change its place in `order`.
7. Run `live-ish check --json`. Fix each issue it reports. `live-ish explain <rule>` says what a rule wants.

## Rules

- Use the public CLI and schema. Never write engine internals by hand.
- Run `live-ish check` before saying a task is done.
- Never state browser support without `live-ish support`.
- If `check` fails twice on the same issue, stop and report it.
