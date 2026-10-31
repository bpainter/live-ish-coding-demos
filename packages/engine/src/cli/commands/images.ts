import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { ImageEntry, ImageManifest, ImageVariant } from "../../lib/assets";
import { prepareDeck } from "../../prepare";
import { EXIT, environment, printJson, requireDeck, resolveFromDeck, type Ctx, type ExitCode } from "../io";

/**
 * The image pipeline. Reads masters under public/ and writes
 * public/opt/<group>/<stem>-<w>.<hash8>.<ext>, plus `.live-ish/images.json` keyed by master path. A
 * master whose bytes and recipe match its entry is skipped, so a run after one new capture touches
 * one file. Hashed names are write-once: an existing file with that name must hold the same bytes.
 * Files under public/opt that no entry names are deleted at the end.
 */

export interface ImageGroup {
  id: "intro" | "backgrounds" | "posters" | "images";
  dir: string;
  match: RegExp;
  out: string;
}

export const IMAGE_GROUPS: ImageGroup[] = [
  { id: "intro", dir: "intro", match: /\.png$/i, out: "intro" },
  { id: "backgrounds", dir: "backgrounds", match: /\.(jpe?g|png)$/i, out: "bg" },
  { id: "posters", dir: "posters", match: /\.(jpe?g|png)$/i, out: "posters" },
  { id: "images", dir: "images", match: /\.(jpe?g|png)$/i, out: "images" },
];

/** AVIF q70 4:4:4 keeps text sharp on stills and posters. The WebP fallback is q85. */
const AVIF = { quality: 70, chromaSubsampling: "4:4:4", effort: 4 } as const;
const WEBP = { quality: 85, effort: 4, smartSubsample: true } as const;

/**
 * The pixels an intro still fills on the canvas: the image is 832 by 816 at most with a 1 px border,
 * so 830 by 814 inside it. The 1x file is exactly that size, so a projector draws it one to one,
 * never resampled by a fraction of a pixel.
 */
const INTRO_BOX = { w: 830, h: 814 };
/** Card images show at 512 canvas px. 1024 serves DPR 2. */
const IMAGE_WIDTHS = [512, 1024];

/** The part of sharp's API this file uses. */
interface SharpImage {
  resize(o: { width: number; height: number; fit: "fill"; kernel: "lanczos3" }): SharpImage;
  avif(o: { quality: number; chromaSubsampling: string; effort: number }): SharpImage;
  webp(o: { quality: number; effort: number; smartSubsample: boolean }): SharpImage;
  clone(): SharpImage;
  toBuffer(): Promise<Buffer>;
  metadata(): Promise<{ width?: number; height?: number }>;
}
type Sharp = (input: string | Buffer) => SharpImage;

/** sharp comes with Next as an optional dependency, so it resolves from Next, not from the deck. */
function loadSharp(root: string): Sharp | null {
  const next = resolveFromDeck(root, "next/package.json");
  if (!next) return null;
  try {
    return createRequire(next)("sharp") as Sharp;
  } catch {
    return null;
  }
}

const sha256 = (buf: Buffer | string) => createHash("sha256").update(buf).digest("hex");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
    .sort();
}

export function listMasters(root: string): { master: string; group: ImageGroup }[] {
  return IMAGE_GROUPS.flatMap((group) =>
    walk(path.join(root, "public", group.dir))
      .filter((rel) => group.match.test(rel))
      .map((rel) => ({ master: `/${group.dir}/${rel}`, group })),
  );
}

export const hasMasters = (root: string) => listMasters(root).length > 0;

const recipeOf = (group: ImageGroup): string => {
  const avif = `avif q${AVIF.quality} ${AVIF.chromaSubsampling} e${AVIF.effort}`;
  const webp = `webp q${WEBP.quality}`;
  switch (group.id) {
    case "intro":
      return `intro ${INTRO_BOX.w}x${INTRO_BOX.h} 0.5x 1x 2x; ${avif}; ${webp}`;
    case "backgrounds":
      return `bg 1x; ${avif}`;
    case "posters":
      return `poster 1x; ${avif}`;
    case "images":
      return `image ${IMAGE_WIDTHS.join(" ")}; ${avif}; ${webp}`;
  }
};

/** `--only` globs, comma separated: `*` within a path segment, `**` across them. */
function globRe(glob: string): RegExp {
  const body = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${body}$`);
}

/** A hashed output, refusing to change the bytes of an existing name. */
function writeOut(root: string, dir: string, stem: string, w: number, ext: "avif" | "webp", buf: Buffer): string {
  const name = `${stem}-${w}.${sha256(buf).slice(0, 8)}.${ext}`;
  const abs = path.join(root, "public", dir, name);
  if (existsSync(abs)) {
    if (sha256(readFileSync(abs)) !== sha256(buf)) throw new Error(`public/${dir}/${name} exists with other bytes. Hashed files are write-once.`);
  } else {
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, buf);
  }
  return `/${dir}/${name}`;
}

async function encode(root: string, sharp: Sharp, master: string, group: ImageGroup, sizes: { w: number; h: number }[], formats: ("avif" | "webp")[]) {
  const abs = path.join(root, "public", master);
  const rel = path.posix.relative(group.dir, master.slice(1));
  const dir = path.posix.join("opt", group.out, path.posix.dirname(rel)).replace(/\/\.$/, "");
  const stem = path.posix.basename(rel, path.posix.extname(rel));
  const out: { avif: ImageVariant[]; webp: ImageVariant[] } = { avif: [], webp: [] };
  for (const s of sizes) {
    const base = sharp(abs).resize({ width: s.w, height: s.h, fit: "fill", kernel: "lanczos3" });
    if (formats.includes("avif")) out.avif.push({ w: s.w, h: s.h, src: writeOut(root, dir, stem, s.w, "avif", await base.clone().avif(AVIF).toBuffer()) });
    if (formats.includes("webp")) out.webp.push({ w: s.w, h: s.h, src: writeOut(root, dir, stem, s.w, "webp", await base.clone().webp(WEBP).toBuffer()) });
  }
  return out;
}

export interface ImagesResult {
  encoded: number;
  skipped: number;
  pruned: number;
}

/**
 * Encodes what changed. With `optional`, a machine without sharp skips this and pages keep their
 * masters, so a build never fails for want of an optimization.
 */
export async function encodeImages(root: string, opts: { log: Ctx["log"]; force?: boolean; only?: string; optional?: boolean }): Promise<ImagesResult> {
  const sharp = loadSharp(root);
  if (!sharp) {
    if (opts.optional) {
      opts.log("sharp is not installed, so images stay as they are.");
      return { encoded: 0, skipped: 0, pruned: 0 };
    }
    throw environment("`live-ish images` needs sharp, which comes with next as an optional dependency.", "Reinstall next with optional dependencies on.");
  }
  const onlyRes = opts.only ? opts.only.split(",").filter(Boolean).map(globRe) : null;
  const matches = (master: string) => !onlyRes || onlyRes.some((re) => re.test(master));
  const manifestPath = path.join(root, ".live-ish", "images.json");
  const old = existsSync(manifestPath) ? (JSON.parse(readFileSync(manifestPath, "utf8")) as ImageManifest) : {};
  const next: ImageManifest = {};
  let encoded = 0;
  let skipped = 0;
  for (const { master, group } of listMasters(root)) {
    const buf = readFileSync(path.join(root, "public", master));
    const sourceHash = sha256(buf);
    const recipe = recipeOf(group);
    const prev = old[master];
    const fresh = prev && prev.sourceHash === sourceHash && prev.recipe === recipe && [...prev.avif, ...prev.webp].every((v) => existsSync(path.join(root, "public", v.src)));
    if ((fresh && !opts.force) || !matches(master)) {
      if (prev) next[master] = prev;
      skipped++;
      continue;
    }
    const meta = await sharp(buf).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    let entry: ImageEntry;
    if (group.id === "intro") {
      // The still keeps its frame's aspect inside the box. Outputs match it at 1x, so the projector
      // (DPR 1) draws the 1x file one to one, and at 0.5x and 2x.
      const scale = Math.min(INTRO_BOX.w / W, INTRO_BOX.h / H);
      const display = { w: Math.round(W * scale), h: Math.round(H * scale) };
      const sizes = [0.5, 1, 2]
        .map((f) => Math.min(W, Math.round(display.w * f)))
        .filter((w, i, a) => a.indexOf(w) === i)
        .map((w) => ({ w, h: Math.round((w * H) / W) }));
      entry = { w: W, h: H, sourceHash, recipe, display, ...(await encode(root, sharp, master, group, sizes, ["avif", "webp"])) };
    } else if (group.id === "images") {
      const fit = IMAGE_WIDTHS.filter((w) => w <= W);
      const sizes = (fit.length ? fit : [W]).map((w) => ({ w, h: Math.round((w * H) / W) }));
      entry = { w: W, h: H, sourceHash, recipe, ...(await encode(root, sharp, master, group, sizes, ["avif", "webp"])) };
    } else {
      entry = { w: W, h: H, sourceHash, recipe, ...(await encode(root, sharp, master, group, [{ w: W, h: H }], ["avif"])) };
    }
    next[master] = entry;
    encoded++;
    opts.log(`  ${master}: ${[...entry.avif, ...entry.webp].length} file(s)`);
  }
  // Sorted keys, so a diff of the manifest shows only what changed.
  const sorted = Object.fromEntries(Object.keys(next).sort().map((k) => [k, next[k]]));
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(sorted, null, 1)}\n`);
  // Delete what no entry names any more: an older encode of a re-captured master.
  const named = new Set(Object.values(next).flatMap((e) => [...e.avif, ...e.webp].map((v) => v.src)));
  let pruned = 0;
  for (const rel of walk(path.join(root, "public", "opt"))) {
    if (!named.has(`/opt/${rel}`)) {
      rmSync(path.join(root, "public", "opt", rel));
      pruned++;
    }
  }
  return { encoded, skipped, pruned };
}

export async function images(ctx: Ctx): Promise<ExitCode> {
  const root = requireDeck(ctx);
  const result = await encodeImages(root, { log: ctx.log, force: ctx.flags.force === true, only: typeof ctx.flags.only === "string" ? ctx.flags.only : undefined });
  // assetExists() answers from the list `prepareDeck` writes, so it has to see the new files.
  await prepareDeck(root);
  if (ctx.json) printJson({ ok: true, ...result });
  else ctx.log(`images: ${result.encoded} encoded, ${result.skipped} unchanged, ${result.pruned} old file(s) removed.`);
  return EXIT.ok;
}
