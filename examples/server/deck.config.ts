import { defineDeck } from "@live-ish/engine/config";

export default defineDeck({
  schemaVersion: 1,
  title: "Drive a real server",
  order: ["title", "request-log", "closing"],
  speaker: { name: "Your Name" },

  // `live-ish dev` and `live-ish present` start this app and stop it again. With the app stopped,
  // its pages show their posters and a note, and the rest of the deck runs as usual.
  hosts: { external: { shop: "http://localhost:4100" } },
  servers: [{ app: "shop", command: "node demos/request-log/app/server.mjs", port: 4100 }],
});
