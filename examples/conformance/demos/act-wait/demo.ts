import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "act-wait",
  title: "Wait",
  scenario: "A pause inside a step.",
  beats: "single",
  single: {
    notes: "A pause sits inside a step.\n\nA replay skips it.",
    files: [shown("index.html")],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "Before the turn", actions: [{ type: "assert", target: "#after", expect: "hidden" }] },
      { id: "s1", label: "Wait, then show", actions: [{ type: "wait", ms: 400 }, { type: "reveal", target: "#after" }, { type: "assert", target: "#after", expect: "visible" }], spotlight: ["#after"], notes: ["The pause plays on the way forward, and a replay skips it."] },
    ],
  },
});
