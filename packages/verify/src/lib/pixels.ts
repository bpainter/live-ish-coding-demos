import { createRequire } from "node:module";
import path from "node:path";
import { EnvironmentError } from "./args";

export interface RawImage {
  data: Buffer;
  info: { width: number; height: number; channels: number };
}

export interface SharpImage {
  resize(o: { width: number; height: number; fit: "fill"; kernel: "lanczos3" }): SharpImage;
  avif(o: { quality: number; chromaSubsampling: string; effort: number }): SharpImage;
  webp(o: { quality: number; effort: number; smartSubsample: boolean }): SharpImage;
  clone(): SharpImage;
  raw(): { toBuffer(o: { resolveWithObject: true }): Promise<RawImage> };
  toBuffer(): Promise<Buffer>;
  metadata(): Promise<{ width?: number; height?: number }>;
}
export type Sharp = (input: string | Buffer) => SharpImage;

/** sharp comes with Next, so a deck has it and this package needs no copy of its own. */
export function loadSharp(root: string): Sharp {
  try {
    const app = createRequire(path.join(root, "package.json"));
    return createRequire(app.resolve("next/package.json"))("sharp") as Sharp;
  } catch {
    throw new EnvironmentError("Could not load sharp from this deck's Next install. Run pnpm install in the deck.");
  }
}

/** Mean absolute difference, 0 to 1, between two same-sized images, RGB only. */
export function meanDifference(a: RawImage, b: RawImage): number {
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) return 1;
  // Screenshots may or may not carry alpha: index each by its own channel count.
  const ca = a.info.channels;
  const cb = b.info.channels;
  const px = a.info.width * a.info.height;
  let sum = 0;
  for (let i = 0; i < px; i++) for (let c = 0; c < 3; c++) sum += Math.abs(a.data[i * ca + c] - b.data[i * cb + c]);
  return sum / (px * 3) / 255;
}

/** WCAG relative luminance of an sRGB color. */
export function luminance(r: number, g: number, b: number): number {
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
