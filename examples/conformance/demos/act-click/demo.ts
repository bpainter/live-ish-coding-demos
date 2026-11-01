import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "act-click",
  title: "Click",
  scenario: "A real click with a ripple.",
  beats: "single",
  single: {
    notes: "A press on a real button.\n\nThe handler answers.",
    files: [shown("index.html")],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "The gate is shut", actions: [{ type: "assert", target: "#state", expect: "hidden" }] },
      { id: "s1", label: "Press the button", actions: [{ type: "pointer", to: "#open" }, { type: "click", target: "#open" }, { type: "assert", target: "#state", expect: "visible" }], spotlight: ["#open", "#state"], notes: ["The press is a real click, so the page's handler runs."] },
    ],
  },
});
