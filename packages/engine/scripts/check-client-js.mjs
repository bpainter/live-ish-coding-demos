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

// Names from the far ends of the alphabet, which nothing in the engine imports directly.
const absent = ["a-arrow-down", "zoom-out", "wheat-off", ...slideIcons];
const found = absent.filter((name) => text.includes(`"${name}"`) || text.includes(`lucide-${name}`));
const used = new Set([...text.matchAll(/lucide-([a-z0-9-]+)/g)].map((m) => m[1]));
console.log(`client JS: ${files.length} files, ${(bytes / 1024).toFixed(0)} KB, ${used.size} Lucide icons: ${[...used].sort().join(", ")}`);
if (found.length) {
  console.error(`check-client-js: found in client JavaScript: ${found.join(", ")}`);
  process.exit(1);
}
console.log("check-client-js: the icon map is not in client JavaScript.");
