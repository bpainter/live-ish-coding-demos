import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "v-shell",
  title: "Frame shell",
  scenario: "Context around the shown block, never shown as code.",
  support: { kind: "web-features", id: "dialog" },
  chip: "Shell",
  navGroup: "Frames",
  intro: {
    description: "A shell puts the shown block in a page of its own.",
    visual: { alt: "A shown block inside a quiet page.", capture: { beat: "after", step: "s1" } },
    notes: "The shell is context.\n\nThe audience reads the block in the middle.",
    minutes: 0.25,
  },
  before: {
    notes: "This page has a shell and no scrolling.\n\nThe block sits in its slot.",
    files: [shown("index.html")],
    shell: { id: "harbor" },
    minutes: 0.5,
    steps: [
      { id: "s0", label: "The shell", actions: [{ type: "assert", target: "#block", expect: "visible" }], code: { file: "index.html", lines: [] } },
      { id: "s1", label: "Mark the block", key: true, actions: [{ type: "reveal", target: "#detail" }, { type: "assert", target: "#detail", expect: "visible" }], code: { file: "index.html", lines: [[1, 3]] }, spotlight: ["#block"], notes: ["The shown markup stays what the slide says it is."] },
    ],
  },
  after: {
    notes: "This shell scrolls, and one element sits outside the slot.\n\nThe overlay root follows the shell.",
    files: [shown("index.html"), shown("block.css")],
    shell: { id: "harbor", outside: ["toast"], scrolls: true },
    minutes: 0.5,
    steps: [
      { id: "s0", label: "A long page", actions: [{ type: "assert", target: "#toast", expect: "visible" }], code: { file: "index.html", lines: [] } },
      { id: "s1", label: "Lift the notice", key: true, actions: [{ type: "reveal", target: "#late" }, { type: "assert", target: "#late", expect: "visible" }], code: { file: "block.css", lines: [[1, 3]] }, spotlight: ["#block"], callouts: [{ target: "#block", text: "Shown block", side: "right" }], notes: ["The notice sits outside the shown slot, by id."] },
    ],
  },
});
