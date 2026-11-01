import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "act-terminal",
  kind: "terminal",
  title: "Terminal",
  scenario: "Recorded lines revealed on each press.",
  beats: "single",
  single: {
    recording: "session",
    window: { title: "tides", cwd: "~/log" },
    files: [shown("tides.txt")],
    notes: "A recording plays a line range per press.\n\nNobody types on stage.",
    minutes: 0.5,
    steps: [
      { id: "s0", label: "Read the log", actions: [{ type: "hook", name: "reset" }, { type: "terminal", lines: [1, 3] }] },
      { id: "s1", label: "Count the lines", actions: [{ type: "terminal", lines: [4, 5] }], spotlight: ['[data-line="5"]'], notes: ["The next command runs, and its output follows."] },
    ],
  },
});
