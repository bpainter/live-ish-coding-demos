import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "act-assert",
  title: "Assert",
  scenario: "Every expectation the runtime knows.",
  beats: "single",
  single: {
    notes: "One page runs the whole grammar.\n\nEach form of the check runs once.",
    files: [shown("index.html"), shown("grid.css")],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "The page at rest", actions: [{ type: "assert", target: "#heading", expect: "visible" }, { type: "assert", target: "#gone", expect: "hidden" }, { type: "assert", target: ".cell", expect: "count=2" }, { type: "assert", target: "#field", expect: "value-length=5" }, { type: "assert", target: "#box", expect: "inline-size=200px" }, { type: "assert", target: "#heading", expect: "text~=grammar" }, { type: "assert", target: "#heading", expect: "contains:Assert" }, { type: "assert", target: "#heading", expect: "attr:data-kind=log" }, { type: "assert", target: "#heading", expect: "no-attr:hidden" }, { type: "assert", target: "#root", expect: "url=/demos/act-assert/single/index.html" }, { type: "assert", target: "#box", expect: "style:display=block" }, { type: "assert", target: "#grid", expect: "columns=2" }, { type: "assert", target: "#gone", expect: "!visible" }] },
      { id: "s1", label: "Focus and a selector", actions: [{ type: "focus", target: "#field" }, { type: "assert", target: "#field", expect: "focused" }, { type: "assert", target: "#field", expect: ":focus" }], spotlight: ["#field"], notes: ["A focus check, and a selector the element must match."] },
      { id: "s2", label: "Open the popover", actions: [{ type: "click", target: "#pop" }, { type: "assert", target: "#tip", expect: ":popover-open" }], spotlight: ["#tip"], notes: ["A popover opens in the top layer."] },
    ],
  },
});
