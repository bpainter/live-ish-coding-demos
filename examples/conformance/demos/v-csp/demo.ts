import { defineDemo } from "@live-ish/engine/config";

export default defineDemo({
  id: "v-csp",
  title: "CSP modes",
  scenario: "The same policy enforced, then report-only.",
  beats: "single",
  single: {
    notes: "A policy blocks an image.\n\nThe flag turns it to report-only.",
    hooks: ["reset", "check"],
    flags: { "csp-enforce": true },
    csp: "default-src 'none'; script-src ORIGIN; style-src ORIGIN 'unsafe-inline'; img-src ORIGIN; font-src ORIGIN; connect-src ORIGIN; form-action ORIGIN; base-uri 'none'; object-src 'none'; frame-ancestors PRESENTER",
    minutes: 0.5,
    steps: [
      { id: "s0", label: "Enforced", actions: [{ type: "hook", name: "check" }, { type: "assert", target: "#state", expect: "contains:blocked" }] },
      { id: "s1", label: "Report only", actions: [{ type: "toggle", flag: "csp-enforce", on: false }, { type: "hook", name: "check" }, { type: "assert", target: "#state", expect: "contains:allowed" }], spotlight: ["#state"], notes: ["The same policy, reported and not enforced."] },
      { id: "s2", label: "Enforced again", actions: [{ type: "toggle", flag: "csp-enforce", on: true }, { type: "hook", name: "check" }, { type: "assert", target: "#state", expect: "contains:blocked" }], spotlight: ["#state"], notes: ["A fresh document, and the policy holds."] },
    ],
  },
});
