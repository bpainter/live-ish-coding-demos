import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "act-hook",
  title: "Hook",
  scenario: "A named frame function, with arguments.",
  beats: "single",
  single: {
    notes: "The script calls into the page.\n\nThe page answers.",
    files: [shown("index.html")],
    hooks: ["reset", "setHeight"],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "No reading yet", actions: [{ type: "assert", target: "#height", expect: "contains:unknown" }] },
      { id: "s1", label: "Call the hook", actions: [{ type: "hook", name: "setHeight", args: ["3.2 m"] }, { type: "assert", target: "#height", expect: "contains:3.2 m" }], spotlight: ["#height"], notes: ["The script calls a function the frame exposes."] },
    ],
  },
});
