import { defineDemo } from "@live-ish/engine/config";

/** This frame refuses every ancestor, so it never answers. The walk proves the page says so. */
export default defineDemo({
  id: "v-blocked",
  title: "Blocked frame",
  scenario: "A frame that never answers.",
  beats: "single",
  single: {
    notes: "This frame refuses to load on purpose.\n\nThe page says so, and Next still leaves.",
    csp: "default-src 'none'; frame-ancestors 'none'",
    minutes: 0.25,
    steps: [{ id: "s0", label: "A silent frame", actions: [] }],
  },
});
