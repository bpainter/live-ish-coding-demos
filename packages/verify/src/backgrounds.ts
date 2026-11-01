import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { isBackgroundFile } from "@live-ish/engine/verify";
import { EnvironmentError, parseArgs } from "./lib/args";
import { loadDeck, type DeckData } from "./lib/deck";
import { Report } from "./lib/report";

/**
 * Measures every background file the deck names: Chromium decodes each one, and this writes the
 * darkest and brightest pixel of the text zones, the file's mean color, a 16 by 9 thumbnail of cell
 * means and its SHA-256 to `.live-ish/backgrounds.json`. `check` compares the hashes with the files,
 * so stale stats fail, and `walk deck` compares the thumbnails.
 */

type RGB = [number, number, number];

export interface BackgroundStats {
  sha256: string;
  width: number;
  height: number;
  mean: RGB;
  thumb: RGB[];
  zones: { name: string; darkest: RGB; brightest: RGB }[];
}

/** The areas a layout sets text in directly on the image, in stage px. */
const ZONES = [
  { name: "header", x: 64, y: 40, w: 1792, h: 200 },
  { name: "body", x: 64, y: 240, w: 1792, h: 700 },
  { name: "footer", x: 64, y: 980, w: 1792, h: 60 },
];

const MEASURE = `async ({ src, zones }) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = (i) => 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
  const sx = w / 1920, sy = h / 1080;
  const outZones = zones.map((z) => {
    let lo = Infinity, hi = -Infinity, dark = [0, 0, 0], bright = [0, 0, 0];
    const x0 = Math.round(z.x * sx), y0 = Math.round(z.y * sy), x1 = Math.round((z.x + z.w) * sx), y1 = Math.round((z.y + z.h) * sy);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const l = lum(i);
      if (l < lo) { lo = l; dark = [data[i], data[i + 1], data[i + 2]]; }
      if (l > hi) { hi = l; bright = [data[i], data[i + 1], data[i + 2]]; }
    }
    return { name: z.name, darkest: dark, brightest: bright };
  });
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) { sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2]; }
  const n = data.length / 4;
  const mean = sum.map((v) => Math.round(v / n));
  const thumb = [];
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 16; cx++) {
    const t = [0, 0, 0]; let k = 0;
    const xa = Math.floor((cx * w) / 16), xb = Math.floor(((cx + 1) * w) / 16), ya = Math.floor((cy * h) / 9), yb = Math.floor(((cy + 1) * h) / 9);
    for (let y = ya; y < yb; y += 2) for (let x = xa; x < xb; x += 2) { const i = (y * w + x) * 4; t[0] += data[i]; t[1] += data[i + 1]; t[2] += data[i + 2]; k++; }
    thumb.push(t.map((v) => Math.round(v / k)));
  }
  return { width: w, height: h, mean, thumb, zones: outZones };
}`;

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml" };

/** The local files a deck uses as backgrounds, once each. A CSS value or a URL has no file here. */
export function backgroundFiles(deck: DeckData): string[] {
  const named = [...deck.slides.map((s) => s.background), ...deck.demos.map((d) => d.background)];
  return [...new Set(named.flatMap((v) => (v && isBackgroundFile(v) && v.startsWith("/") ? [v] : [])))];
}

export async function backgrounds(argv: string[], context: { root: string }): Promise<number> {
  const args = parseArgs(argv, { flags: ["json"] });
  const report = new Report("backgrounds", args.flag("json"));
  const deck = await loadDeck(context.root);
  const urls = backgroundFiles(deck);
  const out: Record<string, BackgroundStats> = {};
  if (urls.length) {
    const browser = await chromium.launch().catch((e: Error) => {
      throw new EnvironmentError(`Could not start chromium: ${e.message.split("\n")[0]}. Run playwright install chromium.`);
    });
    try {
      const page = await browser.newPage();
      await page.setContent("<!doctype html><title>backgrounds</title>");
      for (const url of urls) {
        const abs = path.join(context.root, "public", url);
        if (!existsSync(abs)) {
          report.fail(url, `public${url} does not exist`);
          continue;
        }
        const buf = readFileSync(abs);
        const ext = url.split(".").pop()!.toLowerCase();
        const src = `data:${MIME[ext] ?? "image/jpeg"};base64,${buf.toString("base64")}`;
        const r = (await page.evaluate(`(${MEASURE})(${JSON.stringify({ src, zones: ZONES })})`)) as Omit<BackgroundStats, "sha256">;
        out[url] = { sha256: createHash("sha256").update(buf).digest("hex"), ...r };
        report.pass(`${url}: ${r.width} by ${r.height}, mean rgb(${r.mean.join(" ")})`);
      }
    } finally {
      await browser.close();
    }
  } else report.note("this deck names no background files");
  const file = path.join(context.root, ".live-ish", "backgrounds.json");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
  report.data.measured = Object.keys(out).length;
  return report.finish("backgrounds");
}
