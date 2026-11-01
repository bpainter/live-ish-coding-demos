import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "v-multipage",
  title: "Multi-page build",
  scenario: "Real navigations with a view transition.",
  beats: "single",
  single: {
    notes: "Two documents, with a transition between them.\n\nA replay opens the route directly.",
    files: [shown("index.html"), shown("pages.css")],
    pages: ["two.html"],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "The list", route: "index.html", actions: [{ type: "assert", target: "#page", expect: "contains:All" }] },
      { id: "s1", label: "Open a station", route: "two.html", actions: [{ type: "pointer", to: "#detail" }, { type: "click", target: "#detail" }, { type: "assert", target: "#page", expect: "contains:detail" }], notes: ["A real link and a real load, and the transition plays."] },
      { id: "s2", label: "Mark the link", actions: [{ type: "focus", target: "#home", visible: true }, { type: "assert", target: "#home", expect: "focused" }], spotlight: ["#home"], notes: ["The step stays in the document it landed on."] },
      { id: "s3", label: "Come back", route: "index.html", actions: [{ type: "click", target: "#home" }, { type: "assert", target: "#page", expect: "contains:All" }], notes: ["Another load, and the transition plays again."] },
    ],
  },
});
