import { readFileSync } from "node:fs";
import path from "node:path";
import type { ServerRoute } from "@live-ish/engine/config";

/** A build file, read at request time from the demo's own folder. */
function file(name: string, type: string) {
  const body = readFileSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ process.cwd(), "demos", "v-address", "single", name), "utf8");
  return new Response(body, { headers: { "Content-Type": `${type}; charset=utf-8` } });
}

const routes: ServerRoute[] = [
  // The document this demo opens. The engine composes it, because the page's `address` is this path.
  { method: "GET", path: "/harbor", handler: () => file("index.html", "text/html") },
  { method: "GET", path: "/harbor.css", handler: () => file("harbor.css", "text/css") },
  { method: "GET", path: "/harbor.js", handler: () => file("harbor.js", "text/javascript") },
  { method: "GET", path: "/api/tides", handler: () => Response.json({ level: "3.2 m" }) },
  { method: "POST", path: "/api/notes", handler: async (req) => Response.json({ saved: (await req.text()).length }) },
];

export default routes;
