import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "act-paste",
  title: "Paste",
  scenario: "A value set at once, with a caption.",
  beats: "single",
  single: {
    notes: "Rows land all at once.\n\nThe caption says it was a paste.",
    files: [shown("index.html")],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "An empty box", actions: [{ type: "assert", target: "#rows", expect: "value-length=0" }] },
      { id: "s1", label: "Paste the rows", actions: [{ type: "paste", target: "#rows", text: "north,3.2\nsouth,2.9" }, { type: "assert", target: "#rows", expect: "value-length>10" }], spotlight: ["#rows"], notes: ["The whole value lands at once, with a caption."] },
    ],
  },
});
