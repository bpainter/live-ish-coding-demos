import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "v-clip",
  title: "Clip and keycap",
  scenario: "A docked drawer the ring must not cross.",
  beats: "single",
  single: {
    notes: "The ring ends at the drawer.\n\nThe keycap sits above it.",
    files: [shown("index.html"), shown("drawer.css")],
    spotlightClip: { bottom: 508 },
    keycap: "above-drawer",
    minutes: 0.5,
    steps: [
      { id: "s0", label: "The tall list", actions: [{ type: "assert", target: "#tall", expect: "visible" }], spotlight: ["#tall"] },
      { id: "s1", label: "Press Enter", actions: [{ type: "focus", target: "#go" }, { type: "key", key: "Enter", target: "#go", via: "el.click()" }, { type: "assert", target: "#done", expect: "visible" }], spotlight: ["#tall"], ifKeyboard: "Press Tab to the button, then Enter. Then press Next once to sync the frame.", notes: ["The ring stops above the drawer, and so does the keycap."] },
    ],
  },
});
