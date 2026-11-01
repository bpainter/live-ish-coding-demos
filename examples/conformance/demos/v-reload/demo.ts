import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "v-reload",
  title: "Reloading flag",
  scenario: "A flag that needs a fresh document.",
  beats: "single",
  single: {
    notes: "Turning a script off takes a fresh document.\n\nThe step splits at the toggle.",
    files: [shown("index.html"), shown("status.js")],
    flags: { "enhance-js": true },
    enhancement: { js: ["status.js"] },
    minutes: 0.5,
    steps: [
      { id: "s0", label: "With the script", actions: [{ type: "assert", target: "#state", expect: "contains:ran" }], code: { file: "status.js", lines: [[1, 2]] } },
      { id: "s1", label: "Remove the script", actions: [{ type: "toggle", flag: "enhance-js", on: false }, { type: "assert", target: "#state", expect: "contains:No script" }], code: { file: "status.js", lines: [], off: true }, spotlight: ["#state"], notes: ["The document reloads with no script in it."] },
      { id: "s2", label: "Bring it back", actions: [{ type: "toggle", flag: "enhance-js", on: true }, { type: "assert", target: "#state", expect: "contains:The script ran" }], code: { file: "status.js", lines: [[1, 2]] }, spotlight: ["#state"], notes: ["A fresh document, and the script runs again."] },
    ],
  },
});
