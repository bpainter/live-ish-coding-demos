import { defineDemo, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "v-render",
  title: "Server template",
  scenario: "A template filled from data on the server.",
  beats: "single",
  single: {
    notes: "The shown file stays a template.\n\nThe server fills it.",
    files: [shown("index.html"), shown("station.html")],
    pages: ["station.html"],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "The filled list", route: "index.html", actions: [{ type: "assert", target: "#site", expect: "contains:Halifax" }] },
      { id: "s1", label: "Open a record", route: "station.html?id=north", actions: [{ type: "click", target: "#north" }, { type: "assert", target: "#level", expect: "contains:3.2" }], spotlight: ["#level"], notes: ["The server fills the template from the record."] },
    ],
  },
});
