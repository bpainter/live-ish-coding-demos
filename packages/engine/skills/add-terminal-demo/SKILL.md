---
name: add-terminal-demo
description: Add a terminal demo with its code to a Live-ish deck. Use when the user wants to show commands and their output, or walk through a CLI. Do not use for browser UI demos (use add-web-demo) or for plain text slides (use add-copy-slide).
license: MIT
compatibility: Requires a Live-ish deck with schemaVersion 1.
metadata:
  live-ish-schema: "1"
---

# Add a terminal demo

Run `live-ish` through the deck's package manager, such as `pnpm live-ish check`.

1. Run `live-ish new terminal-demo <id> --json`. Read the paths it prints.
2. Write the commands in `demos/<id>/session.txt`, one per line.
3. Ask the user before running commands they did not write.
4. Run `live-ish record <id>`. Stop if a token is reported.
5. In `demos/<id>/demo.ts`, map each step to a line range and code lines.
6. Add notes the speaker can say. Ask the user to review them.
7. Run `live-ish check --json`. Fix each issue it reports.

For the recording format, read references/recording.md.

## Rules

- Use the public CLI and schema. Never write engine internals by hand.
- Run `live-ish check` before saying a task is done.
- Never state browser support without `live-ish support`.
- If `check` fails twice on the same issue, stop and report it.
