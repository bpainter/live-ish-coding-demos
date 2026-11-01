import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "act-navigate",
  title: "Navigate",
  scenario: "A URL, then back and forward, inside the frame.",
  beats: "single",
  single: {
    notes: "Two documents in one frame.\n\nHistory moves inside it.",
    files: [shown("index.html")],
    pages: ["two.html"],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "The first page", route: "index.html", actions: [{ type: "assert", target: "#page", expect: "contains:First" }] },
      { id: "s1", label: "Open the second", route: "two.html", actions: [{ type: "navigate", url: "two.html" }, { type: "assert", target: "#page", expect: "contains:Second" }], notes: ["A real navigation, inside the frame."] },
      { id: "s2", label: "Go back", route: "index.html", actions: [{ type: "navigate", history: "back" }, { type: "assert", target: "#page", expect: "contains:First" }], notes: ["Back stays inside the frame."] },
      { id: "s3", label: "Go forward", route: "two.html", actions: [{ type: "navigate", history: "forward" }, { type: "assert", target: "#page", expect: "contains:Second" }], notes: ["So does Forward."] },
    ],
  },
});
