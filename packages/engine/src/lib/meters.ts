import "server-only";
import { readFileSync } from "node:fs";
import { generated } from "./paths";

/** The key of a computed meter: the demo id and the step's `meter.source`. */
export const meterKey = (demoId: string, source: string) => `${demoId}:${source}`;

/** Computed meters from `.live-ish/meters.json`; null until `prepareDeck` has run. */
export function meterValue(demoId: string, source: string): string | null {
  try {
    const data = JSON.parse(readFileSync(/*turbopackIgnore: true*/ generated("meters.json"), "utf8")) as Record<string, string>;
    return data[meterKey(demoId, source)] ?? null;
  } catch {
    return null;
  }
}
