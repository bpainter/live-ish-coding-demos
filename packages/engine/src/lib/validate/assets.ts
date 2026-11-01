import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beatDir } from "../../schema/assemble";
import type { Demo, FramePage } from "../../schema/demo";
import { SHELLS } from "../frames/shells";
import { frameThemeHref } from "../posters";

/**
 * Image pipeline helpers, shared by `live-ish check` and the tools that write these files:
 *
 * - every master under the groups below has an entry in `.live-ish/images.json` whose `sourceHash`
 *   matches its bytes, and no entry outlives its master;
 * - every `src` in the manifest exists under public/;
 * - `.live-ish/public-files.json` lists exactly the files on disk, because `assetExists()` answers
 *   from it;
 * - a page's posters were captured from the frame inputs on disk now. `live-ish capture` records
 *   the inputs per page in `.live-ish/posters.json`.
 */

/** Where the masters live and where the encoder writes them (public/opt/<out>/...). */
export const IMAGE_GROUPS = [
  { id: "intro", dir: "intro", match: /\.png$/i, out: "intro" },
  { id: "backgrounds", dir: "backgrounds", match: /\.jpe?g$/i, out: "bg" },
  { id: "posters", dir: "posters", match: /\.(jpe?g|png)$/i, out: "posters" },
  { id: "images", dir: "images", match: /\.(jpe?g|png)$/i, out: "images" },
] as const;

export type ImageGroup = (typeof IMAGE_GROUPS)[number];

export const MANIFEST_FILE = "images.json";
export const POSTERS_FILE = "posters.json";
export const PUBLIC_FILES = "public-files.json";
/** The folders `public-files.json` lists. */
export const LISTED = ["intro", "posters", "images", "opt"];

const ENGINE = fileURLToPath(new URL("../../../", import.meta.url));

export const sha256 = (buf: Buffer | string) => createHash("sha256").update(buf).digest("hex");

/** Files under a directory, recursively, as paths relative to it (dot files skipped). */
export function walkFiles(dir: string, skip: string[] = []): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || e.name.startsWith(".")) continue;
    const rel = path.relative(dir, path.join(e.parentPath, e.name));
    if (rel.split(path.sep).some((part) => skip.includes(part) || part.startsWith("."))) continue;
    out.push(rel.split(path.sep).join("/"));
  }
  return out.sort();
}

/** Every master path ("/intro/faq.png") with its group. */
export function listMasters(root: string): { master: string; group: ImageGroup }[] {
  return IMAGE_GROUPS.flatMap((group) =>
    walkFiles(path.join(root, "public", group.dir))
      .filter((rel) => group.match.test(rel))
      .map((rel) => ({ master: `/${group.dir}/${rel}`, group })),
  );
}

export interface PosterRecord {
  /** `posterInputHash()` when the page's posters were captured. */
  inputs: string;
  captured: string;
}

const SKIP_DIRS = ["node_modules", ".next", ".next-capture", "public", "recordings", "work"];

/**
 * The files a page's frame paints from, hashed: the beat's folder, the demo's own modules and
 * hooks, the frame shell's markup and CSS, stylesheets the page loads, the frame theme, and the
 * page's frame and step actions. Notes and labels are not inputs.
 */
export function posterInputHash(root: string, demo: Demo, page: FramePage, config?: { styles?: string[]; shell?: { id: string } }): string {
  const h = createHash("sha256");
  const add = (label: string, abs: string) => {
    if (!existsSync(abs)) return;
    h.update(`${label}\0`);
    h.update(readFileSync(abs));
  };
  const addDir = (abs: string) => {
    for (const rel of walkFiles(abs, SKIP_DIRS)) add(path.relative(root, path.join(abs, rel)), path.join(abs, rel));
  };
  h.update(JSON.stringify({ frame: page.frame, steps: page.steps.map((s) => ({ id: s.id, actions: s.actions })) }));
  if (page.frame.kind !== "terminal") addDir(path.join(root, beatDir(demo.folder, page.frame.kind, page.beat)));
  const demoDir = path.join(root, demo.folder);
  // `demo.ts` holds the notes, and what it says about the frame is in the JSON above.
  for (const f of existsSync(demoDir) ? readdirSync(demoDir).filter((n) => /\.(ts|mts|js|mjs|json)$/.test(n) && n !== "demo.ts").sort() : []) add(`${demo.folder}/${f}`, path.join(demoDir, f));
  if (page.frame.kind === "terminal") addDir(path.join(demoDir, "recordings"));
  for (const href of config?.styles ?? []) add(`public${href}`, path.join(root, "public", href));
  const shell = config?.shell ? SHELLS[config.shell.id] : undefined;
  if (shell) {
    const r = shell.render({ build: page.beat, demo: demo.id });
    h.update(r.before + r.after);
    for (const href of [...r.styles, ...r.scripts]) add(href, engineAsset(href));
  }
  add("frame-base.css", path.join(ENGINE, "assets", "frame-base.css"));
  // A terminal window takes the theme, so its posters do. Any other page's never go stale with one.
  if (page.frame.kind === "terminal") add("theme", path.join(root, "public", frameThemeHref(page.chrome)));
  return h.digest("hex").slice(0, 16);
}

/** The engine's own copy of a `/live-ish/...` file. */
export function engineAsset(href: string): string {
  return path.join(ENGINE, "assets", href.replace(/^\/live-ish\//, ""));
}

/** Width and height from a JPEG's first SOF marker, or null. */
export function jpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) {
      off++;
      continue;
    }
    const marker = buf[off + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      off += 2;
      continue;
    }
    const len = buf.readUInt16BE(off + 2);
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
    }
    off += 2 + len;
  }
  return null;
}

/** Width and height from a PNG's header, or null. */
export function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf.toString("latin1", 1, 4) !== "PNG") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export const imageSize = (buf: Buffer) => jpegSize(buf) ?? pngSize(buf);
