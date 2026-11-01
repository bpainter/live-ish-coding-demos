import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "v-mixed",
  title: "Mixed beats",
  scenario: "A static page, then a terminal.",
  support: { kind: "web-features", id: "dialog" },
  chip: "Mixed",
  navGroup: "Frames",
  intro: {
    description: "The first beat is a page, and the second is a terminal.",
    notes: "Each beat picks its own frame kind.\n\nThe demo is still one folder.",
    minutes: 0.25,
  },
  before: {
    kind: "static",
    notes: "First, the page.\n\nThis beat has no flags.",
    files: [shown("index.html")],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "The summary", actions: [{ type: "assert", target: "#sum", expect: "visible" }], code: { file: "index.html", lines: [] } },
      { id: "s1", label: "Show the total", key: true, actions: [{ type: "reveal", target: "#total" }, { type: "assert", target: "#total", expect: "visible" }], code: { file: "index.html", lines: [[1, 3]] }, spotlight: ["#total"], notes: ["The total comes from the next beat's command."] },
    ],
  },
  after: {
    kind: "terminal",
    recording: "session",
    window: { title: "gauges", cwd: "~/log" },
    notes: "Now the terminal.\n\nThe same folder holds the recording.",
    files: [shown("readings.txt")],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "Read the file", actions: [{ type: "hook", name: "reset" }, { type: "terminal", lines: [1, 3] }], code: { file: "readings.txt", lines: [] } },
      { id: "s1", label: "Count the readings", key: true, actions: [{ type: "terminal", lines: [4, 5] }], code: { file: "readings.txt", lines: [[1, 2]] }, spotlight: ['[data-line="5"]'], notes: ["The count matches the page before."] },
    ],
  },
});
