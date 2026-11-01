import { defineDemo, excerpt, shown } from "@live-ish/engine/config";

export default defineDemo({
  id: "v-split",
  title: "Wider frame",
  scenario: "A 60/40 split, an excerpt and a meter.",
  before: {
    notes: "The frame takes more of the slide here.\n\nThe panel shows an excerpt.",
    split: "60/40",
    files: [excerpt("list.js", [[1, 3], [6, 8]]), shown("index.html")],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "The wide frame", actions: [{ type: "assert", target: "#list", expect: "visible" }], code: { file: "index.html", lines: [] } },
      { id: "s1", label: "Count the script", key: true, actions: [{ type: "reveal", target: "#list" }, { type: "assert", target: "#list", expect: "visible" }], code: { file: "list.js", lines: [[1, 2]] }, spotlight: ["#list"], meter: { label: "JavaScript", value: "7 lines", source: "before/*.js" }, notes: ["A meter counts the real file."] },
    ],
  },
  after: {
    notes: "Same split, with no script.\n\nThe meter says so.",
    split: "60/40",
    files: [shown("index.html")],
    minutes: 0.5,
    steps: [
      { id: "s0", label: "No script", actions: [{ type: "assert", target: "#list", expect: "visible" }], code: { file: "index.html", lines: [] } },
      { id: "s1", label: "Count it again", key: true, actions: [{ type: "reveal", target: "#list" }, { type: "assert", target: "#list", expect: "visible" }], code: { file: "index.html", lines: [[1, 2]] }, spotlight: ["#list"], meter: { label: "JavaScript", value: "0 lines", source: "after/*.js" }, notes: ["The count is zero."] },
    ],
  },
});
