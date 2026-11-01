import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "act-network",
  title: "Network",
  scenario: "A slow or fast profile, through a hook.",
  beats: "single",
  single: {
    notes: "A link slows down on cue.\n\nThe page hears it through a hook.",
    files: [shown("index.html")],
    hooks: ["reset", "setNetwork"],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "A fast link", actions: [{ type: "assert", target: "#speed", expect: "contains:Fast" }] },
      { id: "s1", label: "Slow it down", actions: [{ type: "network", profile: "slow" }, { type: "assert", target: "#speed", expect: "contains:Slow" }], spotlight: ["#speed"], notes: ["The hook hears the profile, and a caption says so."] },
      { id: "s2", label: "Speed it up", actions: [{ type: "network", profile: "fast" }, { type: "assert", target: "#speed", expect: "contains:Fast" }], spotlight: ["#speed"], notes: ["The profile comes back."] },
    ],
  },
});
