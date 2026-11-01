import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "act-reveal",
  title: "Reveal",
  scenario: "A hidden element shows.",
  beats: "single",
  single: {
    notes: "A notice appears.\n\nIt was in the markup all along.",
    files: [shown("index.html")],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "An empty board", actions: [{ type: "assert", target: "#notice", expect: "hidden" }] },
      { id: "s1", label: "Show the notice", actions: [{ type: "reveal", target: "#notice" }, { type: "assert", target: "#notice", expect: "visible" }], spotlight: ["#notice"], notes: ["The element was hidden, and now it shows."] },
    ],
  },
});
