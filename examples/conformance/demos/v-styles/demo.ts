import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "v-styles",
  title: "Per-demo CSS",
  scenario: "Unshown layout CSS for one demo.",
  beats: "single",
  single: {
    notes: "The layout sits in a stylesheet of its own.\n\nIt never reaches the code panel.",
    files: [shown("index.html")],
    styles: ["/styles/gauge-wall.css"],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "The laid-out wall", actions: [{ type: "assert", target: "#wall", expect: "style:display=flex" }] },
      { id: "s1", label: "Mark the wall", actions: [{ type: "reveal", target: "#wall" }, { type: "assert", target: "#wall", expect: "visible" }], spotlight: ["#wall"], notes: ["This layout comes from a stylesheet the slide never shows."] },
    ],
  },
});
