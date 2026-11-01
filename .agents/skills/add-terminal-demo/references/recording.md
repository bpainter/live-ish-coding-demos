# Recording format

`live-ish record <id>` runs `session.txt` in a temp copy of the demo folder and writes `recordings/session.json`. It needs no browser. A failed command writes nothing.

## `session.txt`

```text
# A line starting with # shows in the recording as a comment.
cat items.txt
node count.mjs items.txt
node count.mjs missing.txt # expect-fail
```

- One command per line.
- Each command runs in its own shell. Files persist from one command to the next. `cd` and `export` do not.
- A command that exits non-zero stops the recording, unless it ends in `# expect-fail`. A marked command that passes also stops it.
- A command must exit by itself within 60 seconds.
- `--session <name>` records `<name>.txt` to `recordings/<name>.json`.

## What the recording holds

```json
{
  "id": "session",
  "capturedAt": "2026-10-31T12:00:00.000Z",
  "env": { "node": "22.0.0" },
  "lines": [
    { "line": 1, "delay": 650, "text": "$ cat items.txt", "kind": "cmd" },
    { "line": 2, "delay": 900, "text": "apples", "kind": "out" }
  ]
}
```

- `kind` is `cmd`, `out` or `comment`.
- Lines number from 1. Each command takes one line, and each line of its output takes one more.
- `env` is a free map. The status bar shows what it holds.
- Color codes are stripped, and the home folder prints as `~`.
- A token stops the recording before anything is written. If it is real, revoke it. A value that only looks like a token still fails, so change it in the session.

Never edit a recorded line by hand. A hand-written line sets `example: true`, and the window chip then reads "Example session", so nothing illustrative claims to be a recording.

## Mapping steps

```ts
actions: [{ type: "terminal", lines: [4, 5] }],
code: { file: "count.mjs", lines: [[7, 12]] },
spotlight: ['[data-line="5"]'],
```

- `lines` is an inclusive range of recorded lines.
- The first step starts at line 1, usually with `{ type: "hook", name: "reset" }` ahead of it. Each step carries on from where the one before stopped. A gap fails `terminal-range`.
- After you edit `session.txt`, run `record` again and check the ranges. The line numbers move.
- `spotlight` takes `[data-line="<n>"]`, the recorded line to mark.
- Files in `files` sit beside `demo.ts`, in the demo's own folder.
