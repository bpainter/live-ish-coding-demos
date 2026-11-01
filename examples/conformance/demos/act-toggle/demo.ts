import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "act-toggle",
  title: "Toggle",
  scenario: "An enhancement flag, with one file named.",
  beats: "single",
  single: {
    notes: "One stylesheet turns off in place.\n\nThe other stays.",
    files: [shown("index.html"), shown("look.css")],
    flags: { "enhance-css": true },
    enhancement: { css: { files: ["look.css"] } },
    minutes: 0.5,
    steps: [
      { id: "s0", label: "With the styles", actions: [{ type: "assert", target: "#list", expect: "visible" }], code: { file: "look.css", lines: [[1, 3]] } },
      { id: "s1", label: "Turn them off", actions: [{ type: "toggle", flag: "enhance-css", on: false }, { type: "assert", target: "#list", expect: "style:list-style-type=disc" }], code: { file: "look.css", lines: [], off: true }, spotlight: ["#list"], notes: ["The enhancement goes, and the list still reads."] },
      { id: "s2", label: "Turn them on", actions: [{ type: "toggle", flag: "enhance-css", on: true }, { type: "assert", target: "#list", expect: "style:list-style-type=none" }], code: { file: "look.css", lines: [[1, 3]] }, spotlight: ["#list"], notes: ["It comes back in place, with no reload."] },
    ],
  },
});
