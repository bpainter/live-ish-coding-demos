import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "v-inner",
  title: "Inner document",
  scenario: "A frame inside the frame.",
  beats: "single",
  single: {
    notes: "A document sits inside the frame.\n\nA hook reaches it through the same origin.",
    files: [shown("index.html")],
    hooks: ["reset", "fill"],
    inner: ["panel.html"],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "The inner document", actions: [{ type: "assert", target: "#panel", expect: "contains:Waiting" }] },
      { id: "s1", label: "Reach inside", actions: [{ type: "hook", name: "fill", args: ["3.2 m at the north wall"] }, { type: "assert", target: "#panel", expect: "contains:3.2 m" }], spotlight: ["#panel"], notes: ["The hook writes into the inner document, on the same origin."] },
    ],
  },
});
