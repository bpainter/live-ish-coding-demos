import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "b-file",
  title: "Background file",
  scenario: "A demo on an image, at the slide's alignment.",
  background: "/backgrounds/harbor.svg",
  beats: "single",
  single: {
    notes: "The stage and the frame share one image.\n\nThe frame lines up with the slide.",
    files: [shown("index.html")],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "The aligned image", actions: [{ type: "assert", target: "#clear", expect: "visible" }] },
      { id: "s1", label: "Show the note", actions: [{ type: "reveal", target: "#clear" }, { type: "assert", target: "#clear", expect: "visible" }], spotlight: ["#clear"], notes: ["The panes stay translucent, so the image shows through."] },
    ],
  },
});
