#!/usr/bin/env node
// Lucide by name stays server-only: `iconByName` runs in server components, so an icon reaches the
// browser as markup and the whole icon map never ships. After a build, this fails if client
// JavaScript holds the map, or an icon only a slide asked for.
//   node scripts/check-client-js.mjs <deck folder> [icon names a slide uses...]
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const [deck = process.cwd(), ...slideIcons] = process.argv.slice(2);
const dir = path.join(deck, ".next", "static");
const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".js"));
let bytes = 0;
const text = files
  .map((f) => {
    bytes += statSync(path.join(dir, f)).size;
    return readFileSync(path.join(dir, f), "utf8");
  })
  .join("\n");

// A bundled Lucide icon carries its own name. The engine's client components import a couple of dozen
// directly; the whole map holds about 1,700.
const LIMIT = 40;
const used = [...new Set([...text.matchAll(/name:"([a-z0-9-]+)",size:\d+,node:/g)].map((m) => m[1]))].sort();
const shipped = new Set(used);
const leaked = ["zoom-out", "wheat-off", "a-large-small", ...slideIcons].filter((name) => shipped.has(name));
console.log(`client JS: ${files.length} files, ${(bytes / 1024).toFixed(0)} KB, ${used.length} Lucide icons: ${used.join(", ")}`);
if (leaked.length || used.length > LIMIT) {
  console.error(`check-client-js: ${used.length} icons in client JavaScript, and these should not be: ${leaked.join(", ") || "none named"}`);
  process.exit(1);
}
console.log("check-client-js: the icon map is not in client JavaScript.");
