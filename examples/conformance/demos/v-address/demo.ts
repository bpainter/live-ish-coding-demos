import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "v-address",
  title: "Root address",
  scenario: "A demo with real paths of its own.",
  beats: "single",
  single: {
    notes: "The frame opens at a root address.\n\nShown code keeps its real paths.",
    files: [shown("index.html"), shown("harbor.js")],
    address: "/harbor",
    sandbox: "allow-scripts allow-same-origin allow-forms",
    minutes: 0.5,
    steps: [
      { id: "s0", label: "A real address", actions: [{ type: "assert", target: "#tide", expect: "contains:No data" }] },
      { id: "s1", label: "Read from a route", actions: [{ type: "click", target: "#load" }, { type: "wait", ms: 200 }, { type: "assert", target: "#tide", expect: "contains:3.2" }], spotlight: ["#tide"], notes: ["The shown code fetches a path the demo declares."] },
      { id: "s2", label: "Post to a route", actions: [{ type: "click", target: "#save" }, { type: "wait", ms: 200 }, { type: "assert", target: "#saved", expect: "contains:Saved" }], spotlight: ["#saved"], notes: ["A POST reaches the demo's own server route."] },
    ],
  },
});
