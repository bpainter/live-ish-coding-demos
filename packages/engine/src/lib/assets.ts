import "server-only";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isBackgroundFile, type Background } from "../schema/backgrounds";
import { generated, publicFile } from "./paths";

/**
 * Every image URL the app renders comes from here. ``live-ish images``
 * (`live-ish images`) encodes the masters under public/ into content-hashed files under
 * public/opt/ and writes content/.generated/images.json, keyed by master path. Pages never link a
 * master once it has an entry: when a master has none (a capture that has not been through
 * ``live-ish images`` yet), the functions below fall back to the master, so nothing goes blank, and
 * ``live-ish check`` says "Images changed; run `live-ish images`".
 */

export interface ImageVariant {
  w: number;
  h: number;
  src: string;
}

export interface ImageEntry {
  /** The master's size. */
  w: number;
  h: number;
  /** SHA-256 of the master's bytes when it was encoded. */
  sourceHash: string;
  /** The encode settings, so a change in `live-ish images` re-encodes. */
  recipe: string;
  /** Intro stills: the box the still fills on the 1920 by 1080 canvas (at most 832 by 816). */
  display?: { w: number; h: number };
  /** public/demo-assets: re-encoded in place, so the entry records the file as it is now. */
  inPlace?: boolean;
  avif: ImageVariant[];
  webp: ImageVariant[];
}

export type ImageManifest = Record<string, ImageEntry>;

let manifest: ImageManifest | undefined;

function imageManifest(): ImageManifest {
  if (manifest && process.env.NODE_ENV === "production") return manifest;
  try {
    manifest = JSON.parse(readFileSync(/*turbopackIgnore: true*/ generated("images.json"), "utf8")) as ImageManifest;
  } catch {
    manifest = {};
  }
  return manifest;
}

/** The manifest entry of a master path such as "/intro/faq.png". */
export function imageEntry(master: string): ImageEntry | undefined {
  const images = imageManifest();
  return Object.prototype.hasOwnProperty.call(images, master) ? images[master] : undefined;
}

// --- Which files exist ---------------------------------------------------------------------------

const LIST_FILE = () => generated("public-files.json");
let listed: { mtime: number; files: Set<string> } | null = null;

/** `.live-ish/public-files.json`, re-read when it changes in development. */
function publicFiles(): Set<string> | null {
  if (listed && process.env.NODE_ENV === "production") return listed.files;
  try {
    const file = LIST_FILE();
    const mtime = statSync(/*turbopackIgnore: true*/ file).mtimeMs;
    if (!listed || listed.mtime !== mtime) listed = { mtime, files: new Set(JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as string[]) };
    return listed.files;
  } catch {
    return null;
  }
}

/**
 * Whether a file under public/intro, public/posters, public/images or public/opt exists, from the
 * build-time list (written in prebuild and predev), so the page functions need not carry the
 * images. In development a path the list does not have (a capture since `next dev`
 * started) is checked on disk; production answers from the list alone.
 */
export function assetExists(publicPath: string | null | undefined): publicPath is string {
  if (!publicPath || !publicPath.startsWith("/")) return false;
  const files = publicFiles();
  if (files?.has(publicPath)) return true;
  // Production never touches public/ on disk: the functions do not carry it (next.config.ts).
  if (process.env.NODE_ENV === "production") return false;
  return existsSync(/*turbopackIgnore: true*/ publicFile(publicPath));
}

// --- Intro stills -------------------------------------------------------------------------------

export interface IntroImage {
  /** The <img> fallback: the WebP at the display width, else the master. */
  src: string;
  /** The display box on the canvas, so the slot is reserved before the still loads (no CLS). */
  width: number | undefined;
  height: number | undefined;
  avifSrcSet: string;
  webpSrcSet: string;
  /** Matches the display width, so a DPR 1 projector picks the 1x file and draws it 1:1. */
  sizes: string;
  /** The file a 1920 by 1080, DPR 1 window picks from the srcset: what the stage decodes ahead. */
  decodeUrl: string;
}

const srcSet = (v: ImageVariant[]) => v.map((x) => `${x.src} ${x.w}w`).join(", ");
/** The variant at a width, else the smallest one wider, else the widest. */
const at = (v: ImageVariant[], w: number) => v.find((x) => x.w === w) ?? v.find((x) => x.w > w) ?? v[v.length - 1];

/** An intro still (`IntroPage.visual.src`), or null when the master is missing. */
export function introImage(master: string): IntroImage | null {
  const e = imageEntry(master);
  if (!e || !e.avif.length) {
    if (!assetExists(master)) return null;
    return { src: master, width: undefined, height: undefined, avifSrcSet: "", webpSrcSet: "", sizes: "", decodeUrl: master };
  }
  const d = e.display ?? { w: e.w, h: e.h };
  const avif1x = at(e.avif, d.w);
  const webp1x = e.webp.length ? at(e.webp, d.w) : null;
  return {
    src: webp1x?.src ?? avif1x.src,
    width: d.w,
    height: d.h,
    avifSrcSet: srcSet(e.avif),
    webpSrcSet: srcSet(e.webp),
    // The stage canvas is 1920 wide and scales with the window (stage.css).
    sizes: `(min-width: 1920px) ${d.w}px, ${+((d.w / 1920) * 100).toFixed(2)}vw`,
    decodeUrl: avif1x.src,
  };
}

// --- Posters ------------------------------------------------------------------------------------

/** The AVIF of a master poster path (public/posters/**), else the master. */
export function posterSrc(master: string): string {
  return imageEntry(master)?.avif[0]?.src ?? master;
}

/** The first candidate poster that exists (authored, captured, frame), as `posterSrc`, or null. */
export function firstPoster(...candidates: (string | null | undefined)[]): string | null {
  const found = candidates.find((c) => assetExists(c));
  return found ? posterSrc(found) : null;
}

// --- Backgrounds --------------------------------------------------------------------------------

export interface BackgroundImage {
  /** The file the author named. */
  url: string;
  /** The file the browser decodes: the AVIF when `live-ish images` has run. */
  decodeUrl: string;
  /** The background as a CSS image for `--slide-bg-image`. */
  css: string;
}

/** A background file, or null for a CSS value or token, which has nothing to decode. */
export function backgroundImage(value: Background | undefined): BackgroundImage | null {
  if (!value || !isBackgroundFile(value)) return null;
  const avif = imageEntry(value)?.avif[0]?.src;
  return {
    url: value,
    decodeUrl: avif ?? value,
    css: avif ? `image-set(url("${avif}") type("image/avif"), url("${value}"))` : `url("${value}")`,
  };
}

/** The CSS image of a background: a file's `url()`, or the value as written. Undefined with none. */
export function backgroundCss(value: Background | undefined): string | undefined {
  if (!value) return undefined;
  return backgroundImage(value)?.css ?? value;
}

// --- Pictures (slide 3's portraits) -------------------------------------------------------------

export interface PictureSources {
  /** <source> elements, in order. */
  sources: { type: string; srcSet: string }[];
  /** The <img>: the WebP 1x (else the master) and its srcset. */
  src: string;
  srcSet: string | undefined;
  sizes: string | undefined;
}

/** A <picture> for a master shown at `displayWidth` canvas px (512 for the portraits). */
export function pictureSources(master: string, displayWidth = 512): PictureSources {
  const e = imageEntry(master);
  if (!e || !e.avif.length) return { sources: [], src: master, srcSet: undefined, sizes: undefined };
  const sizes = `(min-width: 1920px) ${displayWidth}px, ${+((displayWidth / 1920) * 100).toFixed(2)}vw`;
  return {
    sources: [{ type: "image/avif", srcSet: srcSet(e.avif) }],
    src: e.webp.length ? at(e.webp, displayWidth).src : at(e.avif, displayWidth).src,
    srcSet: e.webp.length ? srcSet(e.webp) : undefined,
    sizes,
  };
}
