import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "b-gradient",
  title: "Background value",
  scenario: "A demo on a CSS image.",
  background: "linear-gradient(135deg, #cfe3f0, #f5efe0)",
  beats: "single",
  single: {
    notes: "A CSS value has no file to decode.\n\nThe frame still takes it.",
    files: [shown("index.html")],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "The gradient", actions: [{ type: "assert", target: "#clear", expect: "visible" }] },
      { id: "s1", label: "Show the note", actions: [{ type: "reveal", target: "#clear" }, { type: "assert", target: "#clear", expect: "visible" }], spotlight: ["#clear"], notes: ["The same alignment holds for a gradient."] },
    ],
  },
});
