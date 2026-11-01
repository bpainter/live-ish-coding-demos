import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "act-pointer",
  title: "Pointer",
  scenario: "The ghost cursor glides to an element.",
  beats: "single",
  single: {
    notes: "A cursor glides to a control.\n\nIt presses nothing.",
    files: [shown("index.html")],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "The two gauges", actions: [{ type: "assert", target: "#gauge", expect: "visible" }] },
      { id: "s1", label: "Point at one", actions: [{ type: "pointer", to: "#gauge" }], spotlight: ["#gauge"], notes: ["The cursor moves, and nothing is pressed."] },
      { id: "s2", label: "Point at the other", actions: [{ type: "pointer", to: "#other" }], spotlight: ["#other"], notes: ["The second gauge sits to the right."] },
    ],
  },
});
