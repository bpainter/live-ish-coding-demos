import { defineDemo, shown } from "@live-ish/engine/config";

/**
 * The spotlight fixture: targets with every radius shape, a button whose width transitions over 400
 * ms and a panel that scales in over 200 ms. `live-ish walk fixtures` reads the boxes against them.
 */
export default defineDemo({
  id: "00-fixtures",
  title: "Spotlight fixture",
  scenario: "Every radius a spotlight has to match.",
  beats: "single",
  single: {
    title: "Spotlight fixture",
    notes: "Each box matches its target's corners.\n\nTwo targets move while their boxes show.",
    files: [shown("index.html")],
    hooks: ["reset", "grow", "scaleIn"],
    minutes: 0.25,
    steps: [
      { id: "s0", label: "Radii", actions: [], spotlight: ["#r0", "#r8", "#r16", "#pill", "#mixed", "#circle", "#grow", "#panel"] },
      { id: "s1", label: "Grow", actions: [{ type: "hook", name: "grow" }, { type: "wait", ms: 500 }], spotlight: ["#grow"], notes: ["The box hides while the width moves."] },
      { id: "s2", label: "Scale in", actions: [{ type: "hook", name: "scaleIn" }, { type: "wait", ms: 300 }], spotlight: ["#panel"], notes: ["The box hides while the panel scales."] },
    ],
  },
});
