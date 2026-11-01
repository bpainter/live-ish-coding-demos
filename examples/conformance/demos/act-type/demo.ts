import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "act-type",
  title: "Type",
  scenario: "Input arrives a character at a time.",
  beats: "single",
  single: {
    notes: "A note goes in by hand.\n\nEach character is its own event.",
    files: [shown("index.html")],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "An empty field", actions: [{ type: "assert", target: "#note", expect: "value-length=0" }] },
      { id: "s1", label: "Type a note", actions: [{ type: "type", target: "#note", text: "Slack water at noon" }, { type: "assert", target: "#note", expect: "value-length=19" }], spotlight: ["#note"], notes: ["Each character fires an input event."] },
    ],
  },
});
