import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "v-lanes",
  title: "Feature behind a switch",
  scenario: "An assert that needs a browser feature.",
  beats: "single",
  single: {
    notes: "One assert needs a browser feature.\n\nA browser without it skips that assert.",
    files: [shown("index.html"), shown("lanes.css")],
    flags: { "enhance-css": true },
    enhancement: { css: "supports-blocks" },
    minutes: 0.5,
    steps: [
      { id: "s0", label: "With the feature", actions: [{ type: "assert", target: "#wall", expect: "style:display=grid-lanes", when: "display: grid-lanes" }, { type: "assert", target: "#wall", expect: "style:display=grid", when: "not (display: grid-lanes)" }], code: { file: "lanes.css", lines: [[1, 3]] } },
      { id: "s1", label: "Drop the enhancement", actions: [{ type: "toggle", flag: "enhance-css", on: false }, { type: "assert", target: "#wall", expect: "style:display=grid" }], code: { file: "lanes.css", lines: [], off: true }, spotlight: ["#wall"], notes: ["The supports block goes, and the plain grid stands."] },
    ],
  },
});
