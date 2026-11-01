import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "act-focus",
  title: "Focus",
  scenario: "Focus moves, with a visible ring.",
  beats: "single",
  single: {
    notes: "Focus moves between two controls.\n\nThe ring follows it.",
    files: [shown("index.html")],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "No focus yet", actions: [{ type: "assert", target: "#station", expect: "visible" }] },
      { id: "s1", label: "Focus the field", actions: [{ type: "focus", target: "#station", visible: true }, { type: "assert", target: "#station", expect: "focused" }], spotlight: ["#station"], notes: ["The ring shows where the keyboard is."] },
      { id: "s2", label: "Focus the button", actions: [{ type: "focus", target: "#save", visible: true }, { type: "assert", target: "#save", expect: "focused" }], spotlight: ["#save"], notes: ["Focus moves on, and the ring follows."] },
    ],
  },
});
