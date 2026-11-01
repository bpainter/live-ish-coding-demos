import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "v-poster",
  title: "Poster left out",
  scenario: "A step whose poster would not match.",
  beats: "single",
  single: {
    notes: "Each load differs from the last.\n\nA poster under it would jump.",
    files: [shown("index.html"), shown("sample.js")],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "A random color", posterUnderlay: false, actions: [{ type: "assert", target: "#sample", expect: "visible" }] },
      { id: "s1", label: "Mark the sample", posterUnderlay: false, actions: [{ type: "reveal", target: "#sample" }, { type: "assert", target: "#sample", expect: "visible" }], spotlight: ["#sample"], notes: ["This document differs on every load, so its poster stays out from under it."] },
    ],
  },
});
