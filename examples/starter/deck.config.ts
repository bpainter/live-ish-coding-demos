import { defineDeck } from "@live-ish/engine/config";

export default defineDeck({
  schemaVersion: 1,
  title: "Show the code and the result",
  order: ["title", "what-this-shows", "faq", "count-words", "closing"],
  speaker: { name: "Your Name" },

  // Demo slides use the `glass` audience theme. To try another, set:
  // chrome: { theme: "flat" },        // or "early-web"

  // Stricter rules for copy: no dashes, short sentences, sentence case. Off by default:
  // writing: { preset: "plain" },
});
