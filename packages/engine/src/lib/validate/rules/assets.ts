import { readFileSync } from "node:fs";
import path from "node:path";
import { refusesEmbedding } from "../../../schema/demo";
import type { ImageManifest } from "../../assets";
import { LISTED, MANIFEST_FILE, POSTERS_FILE, PUBLIC_FILES, listMasters, posterInputHash, sha256, walkFiles, type PosterRecord } from "../assets";
import { beatConfig, defineRule, facts, framePages, genPath, publicExists, publicPath, readJson, whereDeck, wherePage } from "../context";
import { fontCodePoints, scanCharacters, showCodePoints } from "../fonts";
import type { Rule } from "../types";

const live = (name: string) => `.live-ish/${name}`;

/** Generated files. Each is checked only when it exists: a deck that has not run its tools has nothing stale. */
export const rules: Rule[] = [
  defineRule("images", "Encoded images match their masters.", (ctx, add) => {
    const manifest = readJson<ImageManifest>(genPath(ctx, MANIFEST_FILE));
    if (!manifest) return;
    const masters = listMasters(ctx.root);
    const stale = masters.map((m) => m.master).filter((master) => {
      const e = manifest[master];
      return !e || e.sourceHash !== sha256(readFileSync(path.join(ctx.root, "public", master)));
    });
    const list = (items: string[]) => `${items.slice(0, 4).join(", ")}${items.length > 4 ? ", …" : ""}`;
    if (stale.length) add(live(MANIFEST_FILE), `Images changed: ${list(stale)}.`, { fix: "Run live-ish images." });
    const known = new Set(masters.map((m) => m.master));
    const orphans = Object.keys(manifest).filter((k) => !known.has(k));
    if (orphans.length) add(live(MANIFEST_FILE), `It has entries for missing masters: ${list(orphans)}.`, { fix: "Run live-ish images." });
    const missing = Object.values(manifest).flatMap((e) => [...e.avif, ...e.webp]).map((v) => v.src).filter((src) => !publicExists(ctx, src));
    if (missing.length) add(live(MANIFEST_FILE), `It names ${missing.length} files that are not under public/: ${list(missing)}.`, { fix: "Run live-ish images." });
  }),

  defineRule("public-files", "The list of public files matches the disk.", (ctx, add) => {
    const listed = readJson<string[]>(genPath(ctx, PUBLIC_FILES));
    if (!listed) return;
    const disk = LISTED.flatMap((d) => walkFiles(path.join(ctx.root, "public", d)).map((rel) => `/${d}/${rel}`));
    const added = disk.filter((f) => !listed.includes(f));
    const removed = listed.filter((f) => !disk.includes(f));
    if (added.length || removed.length) add(live(PUBLIC_FILES), `It differs from public/: ${added.length} new, ${removed.length} gone.`, { fix: "Run live-ish dev or live-ish build." });
  }),

  defineRule("poster-fresh", "Posters were captured from the frame's current inputs.", (ctx, add) => {
    const records = readJson<Record<string, PosterRecord>>(genPath(ctx, POSTERS_FILE));
    if (!records) return;
    for (const demo of ctx.deck.demos) {
      for (const page of framePages(demo)) {
        if (refusesEmbedding(page.frame)) continue;
        const rec = records[page.id];
        if (!rec) add(wherePage(demo, page), "The posters have no capture record.", { fix: `Run live-ish capture ${demo.id}.` });
        else if (rec.inputs !== posterInputHash(ctx.root, demo, page, beatConfig(ctx, demo, page))) add(wherePage(demo, page), `The posters are older than the frame's inputs, captured ${rec.captured.slice(0, 10)}.`, { fix: `Run live-ish capture ${demo.id}.` });
      }
    }
  }),

  defineRule("fonts", "The deck's fonts exist, are WOFF2, and hold the characters it uses.", (ctx, add) => {
    const fonts = facts(ctx).input.config.theme?.fonts;
    if (!fonts) return;
    const scanned = scanCharacters(ctx.root);
    for (const [family, files] of Object.entries(fonts)) {
      const faces: { url: string; has: Set<number> }[] = [];
      for (const url of files ?? []) {
        const at = whereDeck(`theme.fonts.${family}`);
        if (!publicExists(ctx, url)) {
          add(at, `${url} does not exist under public/.`);
          continue;
        }
        if (!url.endsWith(".woff2")) add(at, `${url} is not WOFF2, so the deck pays for the whole font.`, { fix: "Subset it to WOFF2." });
        try {
          faces.push({ url, has: fontCodePoints(readFileSync(publicPath(ctx, url))) });
        } catch (e) {
          add(at, `${url} cannot be read as a font: ${(e as Error).message}.`);
        }
      }
      // Mono carries code; the sans set carries copy. A family with no readable face is reported above.
      if (!faces.length) continue;
      const missing = [...scanned.keys()].filter((c) => c > 0x20 && !/\s/u.test(String.fromCodePoint(c)) && !faces.some((f) => f.has.has(c))).sort((a, b) => a - b);
      if (missing.length) add(whereDeck(`theme.fonts.${family}`), `The ${family} faces miss ${missing.length} characters the deck uses: ${showCodePoints(missing.slice(0, 12))}.`, { fix: "These fall back to another face on stage." });
    }
  }),
];
