import "server-only";
import { readFileSync } from "node:fs";
import { generated } from "./paths";
import type { SupportEntry, SupportFile } from "./support-data";

/** One demo's support entry from `.live-ish/support.json`; null when it has none. */
export function supportEntry(demoId: string): SupportEntry | null {
  try {
    return (JSON.parse(readFileSync(/*turbopackIgnore: true*/ generated("support.json"), "utf8")) as SupportFile).demos[demoId] ?? null;
  } catch {
    return null;
  }
}
