---
name: add-web-demo
description: Add a web demo to a Live-ish deck, with steps, code panels and callouts, usually comparing an old way to a new way in a real page. Use when the user wants to show a browser feature, a UI pattern or a page playing step by step. Do not use for commands and their output (use add-terminal-demo), for text or image slides (use add-copy-slide), or to change a theme (use apply-chrome-theme).
license: MIT
compatibility: Requires a Live-ish deck with schemaVersion 1.
metadata:
  live-ish-schema: "1"
---

# Add a web demo

Run `live-ish` through the deck's package manager, such as `pnpm live-ish check`.

1. Find the feature: `live-ish support "<feature>" --json`. Take a real `id` from the results. That id is the only source for browser support.
2. Run `live-ish new web-demo <id> --json`. Read the paths it prints. Add `--static` for a page with no flags, `--single` for one page with no before and after, or `--server` for a real server. For a server, read references/server.md first.
3. Put the old version in `demos/<id>/before/` and the new one in `demos/<id>/after/`, as plain files.
4. In `demo.ts`, set `title`, `scenario` and `support: { kind: "web-features", id: "<feature-id>" }`. Write the intro's `description` with no numbers or browser names.
5. Write one step at a time: the actions, the code lines, the spotlight, the notes. For the fields and limits, read references/steps.md. `live-ish actions --json` lists every action and the assert grammar.
6. Keep shown code to 44 columns and 40 lines. Show part of a longer file with `excerpt("file.js", [[14, 20]])`, in place of `shown("file.js")`.
7. Add notes the speaker can say. Ask the user to review them.
8. Run `live-ish check --json`. Fix each issue it reports. A `selector` finding lists the ids found in the file.

Press the arrow keys in `pnpm dev` to play it at `/s/<id>-before`.

## Rules

- Use the public CLI and schema. Never write engine internals by hand.
- Run `live-ish check` before saying a task is done.
- Never state browser support without `live-ish support`.
- If `check` fails twice on the same issue, stop and report it.
