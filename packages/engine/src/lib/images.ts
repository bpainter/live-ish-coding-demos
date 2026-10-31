import "server-only";
import { assetExists } from "./assets";

/** A slide image's URL: its encoded form when `live-ish images` has run, else the file as written. */
export function imageSrc(src: string): string | null {
  return /^https?:\/\//.test(src) || assetExists(src) ? src : null;
}
