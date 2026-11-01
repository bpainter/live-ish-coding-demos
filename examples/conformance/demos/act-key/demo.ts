import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "act-key",
  title: "Key",
  scenario: "A keycap and the DOM effect it stands for.",
  beats: "single",
  single: {
    notes: "A dialog closes on Escape.\n\nThe keycap names the key.",
    files: [shown("index.html")],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "Nothing open", actions: [{ type: "assert", target: "#confirm", expect: "no-attr:open" }] },
      { id: "s1", label: "Open the dialog", actions: [{ type: "click", target: "#ask" }, { type: "assert", target: "#confirm", expect: ":modal" }], spotlight: ["#confirm"], notes: ["The dialog opens as a modal."] },
      { id: "s2", label: "Press Escape", actions: [{ type: "key", key: "Escape", target: "#confirm", via: "dialog.requestClose()" }, { type: "assert", target: "#confirm", expect: "no-attr:open" }], ifKeyboard: "Press Escape, then Next once to sync the frame.", notes: ["The keycap shows the key, and the dialog closes itself."] },
    ],
  },
});
