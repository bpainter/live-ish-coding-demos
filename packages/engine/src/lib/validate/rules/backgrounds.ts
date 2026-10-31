import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { isBackgroundFile } from "../../../schema/backgrounds";
import { imageSize, walkFiles } from "../assets";
import { copySlides, defineRule, genPath, memo, publicPath, readJson, whereDemo, whereSlide } from "../context";
import { BACKGROUND } from "../layout";
import type { Rule, RuleContext } from "../types";

/** A CSS image or color: a gradient, a token, a color function or a hex value. */
const CSS_VALUE = /^(#[0-9a-f]{3,8}$|(?:linear-gradient|radial-gradient|conic-gradient|repeating-[a-z]+-gradient|var|url|image-set|color-mix|rgba?|hsla?|oklch|oklab|lab|lch)\()/i;

interface Use {
  where: string;
  value: string;
}

/** Every background a slide or demo names. A deck with none skips this whole group. */
function uses(ctx: RuleContext): Use[] {
  return memo(ctx, "backgrounds", () => [
    ...copySlides(ctx).flatMap((s) => (s.background === undefined ? [] : [{ where: whereSlide(ctx, s, "background"), value: s.background }])),
    ...ctx.deck.demos.flatMap((d) => (d.background === undefined ? [] : [{ where: whereDemo(d, "background"), value: d.background }])),
  ]);
}

/** Local image files, once each, with who uses them. Remote URLs have nothing on disk to read. */
function localFiles(ctx: RuleContext): { url: string; users: string[]; abs: string }[] {
  const byUrl = new Map<string, string[]>();
  for (const u of uses(ctx)) if (isBackgroundFile(u.value) && u.value.startsWith("/")) byUrl.set(u.value, [...(byUrl.get(u.value) ?? []), u.where]);
  return [...byUrl].map(([url, users]) => ({ url, users, abs: publicPath(ctx, url) })).filter((f) => existsSync(f.abs));
}

const digest = (abs: string) => createHash("sha256").update(readFileSync(abs)).digest("hex");

/** Backgrounds are optional. These apply to the ones a deck names. */
export const rules: Rule[] = [
  defineRule("bg-missing", "A background field is not left blank.", (ctx, add) => {
    for (const u of uses(ctx)) if (!u.value.trim()) add(u.where, "The background is blank.", { fix: "Remove the field, since a slide with none uses the theme's surface." });
  }),

  defineRule("bg-unknown", "A background is a file, a URL or a CSS value.", (ctx, add) => {
    for (const u of uses(ctx)) {
      if (u.value.trim() && !isBackgroundFile(u.value) && !CSS_VALUE.test(u.value.trim())) add(u.where, `"${u.value}" is not a file, a URL or a CSS value.`, { fix: 'Start a file under public/ with "/": "/backgrounds/field.jpg".' });
    }
  }),

  defineRule("bg-file", "A background file exists under public/.", (ctx, add) => {
    for (const u of uses(ctx)) if (u.value.startsWith("/") && !existsSync(publicPath(ctx, u.value))) add(u.where, `public${u.value} does not exist.`);
  }),

  defineRule("bg-unused", "Every file under public/backgrounds/ is in use.", (ctx, add) => {
    if (!uses(ctx).length) return;
    const used = new Set(uses(ctx).map((u) => u.value));
    for (const rel of walkFiles(path.join(ctx.root, "public", "backgrounds"))) {
      if (/\.(jpe?g|png|webp|avif)$/i.test(rel) && !used.has(`/backgrounds/${rel}`)) add(`public/backgrounds/${rel}`, "No slide or demo uses this file.", { fix: "Delete it, so it stops shipping." });
    }
  }),

  defineRule("bg-shared", "Each background file belongs to one slide or demo.", (ctx, add) => {
    for (const { url, users } of localFiles(ctx)) if (users.length > 1) add(users[1], `${url} is also used by ${users[0]}.`, { fix: "Each file belongs to one slide or demo." });
  }),

  defineRule("bg-size", "A background file is 1920 by 1080.", (ctx, add) => {
    for (const { url, users, abs } of localFiles(ctx)) {
      const size = imageSize(readFileSync(abs));
      if (size && (size.width !== BACKGROUND.width || size.height !== BACKGROUND.height)) add(users[0], `${url} is ${size.width} by ${size.height}, and the stage is ${BACKGROUND.width} by ${BACKGROUND.height}.`);
    }
  }),

  defineRule("bg-bytes", "A background file stays light.", (ctx, add) => {
    for (const { url, users, abs } of localFiles(ctx)) {
      const bytes = statSync(abs).size;
      if (bytes > BACKGROUND.warnBytes) add(users[0], `${url} is ${Math.round(bytes / 1024)} KB. Aim for ${BACKGROUND.warnBytes / 1024} KB, with a limit of 1.5 MB.`);
    }
  }),

  defineRule("bg-duplicate", "No two background files hold the same image.", (ctx, add) => {
    const seen = new Map<string, string>();
    for (const { url, users, abs } of localFiles(ctx)) {
      const hash = digest(abs);
      const dup = seen.get(hash);
      if (dup) add(users[0], `${url} is the same file as ${dup}.`);
      seen.set(hash, url);
    }
  }),

  defineRule("bg-stats", "Measured background stats match the files.", (ctx, add) => {
    const stats = readJson<Record<string, { sha256: string }>>(genPath(ctx, "backgrounds.json"));
    if (!stats) return;
    for (const { url, users, abs } of localFiles(ctx)) {
      if (stats[url]?.sha256 !== digest(abs)) add(users[0], `.live-ish/backgrounds.json is stale for ${url}.`, { fix: "Run live-ish backgrounds." });
    }
  }),
];
