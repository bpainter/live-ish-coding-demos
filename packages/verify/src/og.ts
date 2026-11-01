import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OG_IMAGE_FILE, OG_META_FILE, jpegSize, ogHash, ogInputs, type OgMeta } from "@live-ish/engine/verify";
import { UsageError, parseArgs } from "./lib/args";
import { loadDeck } from "./lib/deck";
import { Report } from "./lib/report";
import { BROWSER_FLAGS, BROWSER_VALUES, sessionOptions, withSession } from "./lib/session";

/**
 * The shared Open Graph image: the title slide from a running server, as public/live-ish/og/cover.jpg
 * (1200 by 630, JPEG quality 88), plus `.live-ish/og.json`, the hash of the inputs. `check` fails with
 * "The cover changed" when an input changes. At a 1200 by 675 viewport the stage scales the 1920 by
 * 1080 canvas by exactly 0.625, and the shot clips x 0, y 22, w 1200, h 630.
 */

const SIZE = { width: 1200, height: 630 };
const MAX_BYTES = 300 * 1024;
const VIEWPORT = { width: 1200, height: 675 };
const CLIP = { x: 0, y: 22, ...SIZE };
/** Everything that is not the canvas, inside it or around it: no chrome reaches the image. */
const HIDE_CHROME = ":where(body *):not(.stage__canvas, .stage__canvas *, :has(.stage__canvas)) { visibility: hidden !important; } nextjs-portal { display: none !important; }";

export async function og(argv: string[], context: { root: string }): Promise<number> {
  const args = parseArgs(argv, { values: BROWSER_VALUES, flags: BROWSER_FLAGS });
  if (args.words.length) throw new UsageError(`og takes no id, found ${args.words.join(", ")}.`);
  const report = new Report("og", args.flag("json"));
  const deck = await loadDeck(context.root);
  const title = deck.slides.find((s) => s.layout === "title") ?? deck.slides[0];
  const fonts = deck.input.config.theme?.fonts;
  const inputs = ogInputs(context.root, deck, [...(fonts?.sans ?? []), ...(fonts?.mono ?? [])]);
  const hash = ogHash(inputs);
  return withSession(deck, sessionOptions(args), report, async (session) => {
    const ctx = await session.context({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(`${session.origin}/s/${title.id}?capture=1`, { waitUntil: "load" });
    await page.waitForSelector(".stage__canvas .slide");
    await page.addStyleTag({ content: HIDE_CHROME });
    const background = await page.locator(".stage__canvas").getAttribute("data-background");
    await page.evaluate(
      `(async (src) => {
        await document.fonts.ready;
        if (src) { const img = new Image(); img.src = src; await img.decode(); }
        document.activeElement?.blur?.();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      })(${JSON.stringify(background)})`,
    );
    await page.waitForTimeout(300);
    const scale = await page.locator(".stage").evaluate((el) => getComputedStyle(el).getPropertyValue("--stage-scale").trim());
    if (Number(scale) !== 0.625) report.fail("og", `the stage scale is ${scale}, not 0.625`);
    const box = await page.locator(".stage__canvas").boundingBox();
    if (!box || Math.abs(box.x) > 0.5 || Math.abs(box.y) > 0.5 || Math.abs(box.width - 1200) > 0.5) report.fail("og", `the canvas sits at ${JSON.stringify(box)}, not 0 0 1200 675`);
    const jpeg = await page.screenshot({ type: "jpeg", quality: 88, clip: CLIP });
    await ctx.close();
    const size = jpegSize(jpeg);
    if (!size || size.width !== SIZE.width || size.height !== SIZE.height) report.fail("og", `captured ${JSON.stringify(size)}, not ${SIZE.width} by ${SIZE.height}`);
    if (jpeg.length > MAX_BYTES) report.fail("og", `the image is ${Math.round(jpeg.length / 1024)} KB, over ${MAX_BYTES / 1024}`);
    if (report.failures.length) return report.finish("og");
    const image = path.join(context.root, OG_IMAGE_FILE);
    mkdirSync(path.dirname(image), { recursive: true });
    writeFileSync(image, jpeg);
    const meta: OgMeta = { hash, width: size!.width, height: size!.height, imageSha256: createHash("sha256").update(jpeg).digest("hex"), inputs };
    const metaFile = path.join(context.root, ".live-ish", OG_META_FILE);
    mkdirSync(path.dirname(metaFile), { recursive: true });
    writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
    report.pass(`${OG_IMAGE_FILE} ${size!.width} by ${size!.height}, ${Math.round(jpeg.length / 1024)} KB, v=${hash.slice(0, 8)}`);
    return report.finish("og");
  });
}
