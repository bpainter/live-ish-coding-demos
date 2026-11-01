import { defineDemo } from "@live-ish/engine/config";

export default defineDemo({
  id: "v-static",
  kind: "static",
  title: "Static table",
  scenario: "A table revealed row by row.",
  beats: "single",
  single: {
    notes: "No flags on this page.\n\nEach press shows the next row.",
    minutes: 0.5,
    steps: [
      { id: "s0", label: "The first row", actions: [{ type: "assert", target: "#one", expect: "visible" }] },
      { id: "s1", label: "The second row", actions: [{ type: "reveal", target: "#two" }, { type: "assert", target: "#two", expect: "visible" }], spotlight: ["#two"], notes: ["A reveal is all this page needs."] },
      { id: "s2", label: "The third row", actions: [{ type: "reveal", target: "#three" }, { type: "assert", target: "#three", expect: "visible" }], spotlight: ["#three"], notes: ["The table is complete."] },
    ],
  },
});
