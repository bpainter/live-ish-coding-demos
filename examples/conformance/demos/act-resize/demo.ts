import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "act-resize",
  title: "Resize",
  scenario: "A container, then the frame, change size.",
  beats: "single",
  single: {
    notes: "A chart narrows, then the frame does.\n\nThe strip marks the frame's edge.",
    files: [shown("index.html"), shown("chart.css")],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "The full chart", actions: [{ type: "assert", target: "#chart", expect: "visible" }] },
      { id: "s1", label: "Narrow the chart", actions: [{ type: "resize", target: "#chart", inlineSize: "300px" }, { type: "assert", target: "#chart", expect: "inline-size=300px" }], spotlight: ["#chart"], notes: ["The container animates to its new width."] },
      { id: "s2", label: "Narrow the frame", actions: [{ type: "resize", target: ":viewport", inlineSize: "480px" }], notes: ["The frame itself narrows, as a phone would."] },
    ],
  },
});
