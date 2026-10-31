import { existsSync, readFileSync } from "node:fs";
import type { Slide } from "../../schema/slide";
import { hasFrame, SPLITS } from "../../schema/demo";
import type { Mode } from "../../lib/mode";
import { renderCodeFiles } from "../../lib/highlight";
import { manifestFor } from "../../lib/frames/registry";
import { meterValue } from "../../lib/meters";
import { elisionLines } from "../../lib/excerpt";
import { firstPoster } from "../../lib/assets";
import { fromDeck } from "../../lib/paths";
import { PageBody } from "./PageBody";
import { IntroSlide } from "./IntroSlide";
import { FrameWarm } from "./FrameWarm";

interface Props {
  slide: Slide;
  total: number;
  mode: Mode;
}

const BROWSER_NAMES = { chrome: "Chrome", edge: "Edge", firefox: "Firefox", safari: "Safari" } as const;

/**
 * Slot geometry on the 1920 x 1080 canvas: pages with code split their 1792 px body into the frame
 * (left) and the code (right), 32 px apart, by the page's `split` (`SPLITS`: 880 + 880 by default,
 * 1056 + 704 at 60/40); a page with no code uses one 1792 by 864 slot.
 */
export const SLOT = { split: { width: 880, height: 864 }, full: { width: 1792, height: 864 } };

/**
 * One demo page. Intro slides render `IntroSlide`. Walk pages show the demo's title as the eyebrow,
 * the beat's label, the meter at the top right of the title row, the frame and the code panel.
 * Single pages show the demo's title and one slot, split when they have code.
 */
export async function DemoPageSlide({ slide, mode }: Props) {
  const page = slide.page;
  const demo = slide.demo;
  if (!page || !demo) throw new Error(`Slide ${slide.id} has layout demo-page but no page`);
  if (!hasFrame(page)) {
    const nextPage = demo.pages[demo.pages.indexOf(page) + 1];
    const warm = mode === "audience" && nextPage && hasFrame(nextPage) ? nextPage.frame : null;
    return (
      <>
        <IntroSlide demo={demo} page={page} />
        {warm ? <FrameWarm route={warm.route} flags={warm.flags} sandbox={manifestFor(warm.route)?.sandbox ?? "allow-scripts allow-same-origin"} /> : null}
      </>
    );
  }
  const sourceFiles = page.files;
  const rendered = await renderCodeFiles(sourceFiles.map((f) => ({ file: f.file, lang: f.lang, source: f.source })));
  // Elision lines of excerpts render dimmed and italic and are never highlighted.
  const files = rendered.map((r, i) => {
    const ex = sourceFiles[i].excerptOf;
    const abs = ex ? fromDeck(ex.path) : null;
    const total = abs && existsSync(/*turbopackIgnore: true*/ abs) ? readFileSync(/*turbopackIgnore: true*/ abs, "utf8").replace(/\n$/, "").split("\n").length : 0;
    return { ...r, elisions: ex ? elisionLines(ex.ranges, total) : [] };
  });
  const manifest = manifestFor(page.frame.route);
  const split = files.length > 0;
  const ratio = split ? page.split : null;
  const slot = ratio ? { width: SPLITS[ratio].frame, height: SLOT.split.height } : SLOT.full;
  const meters = Object.fromEntries(page.steps.filter((s) => s.meter).map((s) => [s.id, meterValue(demo.id, s.meter!.source)]));
  // One captured poster per step keeps the speaker's previews from going blank; an authored poster
  // still wins. Posters are optional: only the ones that exist, served as their AVIF (lib/assets.ts).
  const posters = Object.fromEntries(page.steps.map((s) => [s.id, firstPoster(s.poster, `/posters/${page.id}/${s.id}.jpg`, page.frame.poster)]));
  const eyebrow = page.beat === "single" ? null : page.eyebrow;
  return (
    <article className="page" data-beat={page.beat} data-split={split} data-ratio={ratio ?? undefined} aria-label={eyebrow ? `${eyebrow}: ${page.title}` : page.title}>
      <header className="page__header">
        {eyebrow ? <p className="page__eyebrow">{eyebrow}</p> : null}
        <h1 className="page__title">{page.title}</h1>
        {page.beat === "single" && page.badge ? (
          <p className="page__badge">
            {page.badge.text}
            {page.badge.missing?.map((b) => (
              <s key={b}>
                {BROWSER_NAMES[b]}
                <span className="visually-hidden"> missing</span>
              </s>
            ))}
          </p>
        ) : null}
      </header>
      <PageBody page={page} files={files} sandbox={manifest?.sandbox ?? "allow-scripts allow-same-origin"} mode={mode} slot={slot} meters={meters} posters={posters} />
    </article>
  );
}
