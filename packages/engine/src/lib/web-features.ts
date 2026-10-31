import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { WebFeaturesData } from "./support-data";

/**
 * The installed `web-features` package: its version and data.json. Its exports map does not expose
 * package.json, so both are read from the folder its entry point resolves to.
 */
export function installedWebFeatures(): { version: string; data: WebFeaturesData } {
  const entry = createRequire(import.meta.url).resolve("web-features/data.json");
  const dir = path.dirname(entry);
  const version = (JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { version: string }).version;
  const data = JSON.parse(readFileSync(entry, "utf8")) as WebFeaturesData;
  return { version, data };
}
