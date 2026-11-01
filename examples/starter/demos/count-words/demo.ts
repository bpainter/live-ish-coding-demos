import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "count-words",
  kind: "terminal",
  title: "Counting words",
  scenario: "A small script counts words in a file, then ranks them.",
  // One page, with no intro, before or after.
  beats: "single",

  single: {
    // recordings/session.json. `live-ish record count-words` writes it by running session.txt.
    recording: "session",
    window: { title: "word-count", cwd: "~/demo" },
    files: [shown("word-count.mjs"), shown("notes.txt")],
    notes: "Here is a small script and a small file.\n\nNobody has to watch me type. Each press runs the next command.",
    minutes: 1.5,
    steps: [
      {
        id: "s0",
        label: "Read the notes",
        // `lines` is a range of the recording, and each step picks up where the last one stopped.
        actions: [{ type: "hook", name: "reset" }, { type: "terminal", lines: [1, 3] }],
        code: { file: "notes.txt", lines: [] },
        notes: [],
      },
      {
        id: "s1",
        label: "Count the words",
        actions: [{ type: "terminal", lines: [4, 5] }],
        code: { file: "word-count.mjs", lines: [[7, 12]] },
        // A recorded line is a target too, by its number.
        spotlight: ['[data-line="5"]'],
        notes: ["The script reads the file, splits it into words and prints the count."],
      },
      {
        id: "s2",
        label: "Count each word",
        actions: [{ type: "terminal", lines: [6, 7] }],
        code: { file: "word-count.mjs", lines: [[14, 19]] },
        spotlight: ['[data-line="6"]'],
        notes: ["With the top flag, it also keeps a count for each word."],
      },
      {
        id: "s3",
        label: "Rank the top three",
        key: true,
        actions: [{ type: "terminal", lines: [8, 10] }],
        code: { file: "word-count.mjs", lines: [[20, 26]] },
        spotlight: ['[data-line="8"]'],
        ifKeyboard: "Press l to hide the recording, then run the command yourself.",
        notes: ["Then it sorts the counts and prints the first three.", "The code on the right ran to produce the output on the left."],
      },
    ],
  },
});
