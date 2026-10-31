import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { brotliDecompressSync } from "node:zlib";

/**
 * Reading a font's character map, shared by `live-ish check` and the font subsetter. A deck's text
 * lives in its slides, its demos and its config; every character it uses should be in the fonts it
 * names, or a slide falls back to another face in front of the room.
 */

/** Code point ranges every subset keeps, inclusive. */
export const SUBSET_RANGES: [number, number][] = [
  [0x20, 0x7e], // Basic Latin
  [0xa0, 0xff], // Latin-1 Supplement
  [0x2000, 0x206f], // General Punctuation: curly quotes, dashes, ellipsis, bullet, thin spaces
  [0x2190, 0x21ff], // Arrows
  [0x20ac, 0x20ac], // €
  [0x2122, 0x2122], // ™
  [0x2212, 0x2212], // − minus
];

/** Where a deck's text lives, relative to its root. */
export const SCAN_ROOTS = ["deck.config.ts", "slides", "demos"];
const SCAN_EXT = /\.(tsx?|mts|m?js|json|html|css|md|txt|svg|http|ya?ml)$/i;
/** Build output, installed packages and vendored libraries: nothing the deck writes. */
const SKIP_DIR = new Set(["node_modules", "dist", "vendor", "coverage", "recordings"]);

function* walk(entry: string): Generator<string> {
  if (!existsSync(entry)) return;
  if (SCAN_EXT.test(entry)) {
    yield entry;
    return;
  }
  for (const e of readdirSync(entry, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(entry, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIR.has(e.name)) yield* walk(p);
    } else if (SCAN_EXT.test(e.name)) yield p;
  }
}

const ENTITIES: Record<string, number> = { nbsp: 0xa0, copy: 0xa9, middot: 0xb7, times: 0xd7, ndash: 0x2013, mdash: 0x2014, lsquo: 0x2018, rsquo: 0x2019, ldquo: 0x201c, rdquo: 0x201d, bull: 0x2022, hellip: 0x2026, euro: 0x20ac, trade: 0x2122, larr: 0x2190, uarr: 0x2191, rarr: 0x2192, darr: 0x2193, minus: 0x2212 };

/** Characters written as escapes: JS `→` and `\u{2192}`, HTML `&#x2192;`, `&#8594;` and `&rarr;`, CSS `\2192`. */
function escaped(text: string, css: boolean): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|&#x([0-9a-f]{1,6});|&#(\d{1,7});|&([a-z]+);/gi)) {
    const cp = m[1] || m[2] || m[3] ? parseInt(m[1] ?? m[2] ?? m[3], 16) : m[4] ? Number(m[4]) : ENTITIES[m[5]];
    if (cp !== undefined) out.push(cp);
  }
  if (css) for (const m of text.matchAll(/\\([0-9a-f]{1,6})/gi)) out.push(parseInt(m[1], 16));
  return out;
}

/** Every character outside ASCII control codes in the scanned files, written or escaped, with one file that uses it. */
export function scanCharacters(root: string): Map<number, string> {
  const found = new Map<number, string>();
  for (const r of SCAN_ROOTS)
    for (const file of walk(path.join(root, r))) {
      const text = readFileSync(file, "utf8");
      const cps = [...text].map((ch) => ch.codePointAt(0)!).concat(escaped(text, file.endsWith(".css")));
      for (const cp of cps) {
        if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0) || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff || found.has(cp)) continue;
        found.set(cp, path.relative(root, file));
      }
    }
  return found;
}

/** The code points a subset must keep: the ranges and the scan. */
export function requiredCodePoints(scanned: Iterable<number>): Set<number> {
  const out = new Set<number>(scanned);
  for (const [a, b] of SUBSET_RANGES) for (let c = a; c <= b; c++) out.add(c);
  return out;
}

/** WOFF2's UIntBase128. */
function base128(buf: Buffer, at: { o: number }): number {
  let v = 0;
  for (let i = 0; i < 5; i++) {
    const b = buf[at.o++];
    v = v * 128 + (b & 0x7f);
    if (!(b & 0x80)) return v;
  }
  throw new Error("bad UIntBase128");
}

/** The cmap table of an SFNT (OTF, TTF) or WOFF2 file. */
function cmapTable(buf: Buffer): Buffer {
  const sig = buf.toString("latin1", 0, 4);
  if (sig === "wOF2") {
    const numTables = buf.readUInt16BE(12);
    const compressed = buf.readUInt32BE(20);
    const at = { o: 48 };
    const tables: { tag: number; length: number }[] = [];
    for (let i = 0; i < numTables; i++) {
      const flags = buf[at.o++];
      const tag = flags & 0x3f;
      if (tag === 0x3f) at.o += 4;
      const orig = base128(buf, at);
      const version = (flags >> 6) & 3;
      // glyf (10) and loca (11) are transformed at version 0; every other table at any other version.
      const transformed = tag === 10 || tag === 11 ? version === 0 : version !== 0;
      tables.push({ tag, length: transformed ? base128(buf, at) : orig });
    }
    const data = brotliDecompressSync(buf.subarray(at.o, at.o + compressed));
    let offset = 0;
    for (const t of tables) {
      // Known tag 0 is cmap; tables follow each other in directory order.
      if (t.tag === 0) return data.subarray(offset, offset + t.length);
      offset += t.length;
    }
    throw new Error("no cmap table");
  }
  const numTables = buf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (buf.toString("latin1", rec, rec + 4) === "cmap") {
      const offset = buf.readUInt32BE(rec + 8);
      return buf.subarray(offset, offset + buf.readUInt32BE(rec + 12));
    }
  }
  throw new Error("no cmap table");
}

/** The Unicode code points a font maps to a glyph (cmap formats 4 and 12). */
export function fontCodePoints(buf: Buffer): Set<number> {
  const cmap = cmapTable(buf);
  const out = new Set<number>();
  const n = cmap.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const platform = cmap.readUInt16BE(4 + i * 8);
    const encoding = cmap.readUInt16BE(6 + i * 8);
    if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) continue;
    const sub = cmap.readUInt32BE(8 + i * 8);
    const format = cmap.readUInt16BE(sub);
    if (format === 4) {
      const segs = cmap.readUInt16BE(sub + 6) / 2;
      const ends = sub + 14;
      const starts = ends + segs * 2 + 2;
      const deltas = starts + segs * 2;
      const ranges = deltas + segs * 2;
      for (let s = 0; s < segs; s++) {
        const end = cmap.readUInt16BE(ends + s * 2);
        const start = cmap.readUInt16BE(starts + s * 2);
        const delta = cmap.readInt16BE(deltas + s * 2);
        const rangeOffset = cmap.readUInt16BE(ranges + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph: number;
          if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
          else {
            const g = cmap.readUInt16BE(ranges + s * 2 + rangeOffset + (c - start) * 2);
            glyph = g === 0 ? 0 : (g + delta) & 0xffff;
          }
          if (glyph) out.add(c);
        }
      }
    } else if (format === 12) {
      const groups = cmap.readUInt32BE(sub + 12);
      for (let g = 0; g < groups; g++) {
        const at = sub + 16 + g * 12;
        const start = cmap.readUInt32BE(at);
        const end = cmap.readUInt32BE(at + 4);
        for (let c = start; c <= end; c++) out.add(c);
      }
    }
  }
  return out;
}

export const showCodePoints = (cps: number[]) => cps.map((c) => `${String.fromCodePoint(c)} (U+${c.toString(16).toUpperCase().padStart(4, "0")})`).join(", ");

/** For the subsetter: characters the deck uses that a master has no glyph for (they fall back). */
export function uncovered(master: Buffer, scanned: Map<number, string>): string[] {
  const has = fontCodePoints(master);
  return [...scanned.entries()].filter(([c]) => c > 0x7e && !has.has(c) && !/\s/u.test(String.fromCodePoint(c))).map(([c, file]) => `${showCodePoints([c])} in ${file}`);
}
