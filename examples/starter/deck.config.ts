import { defineDeck } from "@live-ish/engine/config";

export default defineDeck({
  schemaVersion: 1,
  title: "Show the code and the result",
  order: ["title", "what-this-shows", "faq", "count-words", "closing"],
  speaker: { name: "Your Name" },

  // Demo slides use the `glass` audience theme. To try another, set:
  // chrome: { theme: "flat" },        // or "early-web"

  // The owner's house style for copy. Off by default:
  // writing: { preset: "plain" },
});
