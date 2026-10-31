import type { Demo, IntroPage } from "../../schema/demo";
import { introImage } from "../../lib/assets";
import { supportEntry } from "../../lib/support";
import { SupportRow } from "./SupportRow";

/**
 * The intro slide of a demo: a captured still on the left when one exists; the title, the author's
 * one-sentence description plus the generated support sentence, the support row and the "also uses"
 * line on the right. No frame and no code. A still or support data that is missing leaves its place
 * empty, and tool hints never render on the stage.
 */
export function IntroSlide({ demo, page }: { demo: Omit<Demo, "routes">; page: IntroPage }) {
  const support = supportEntry(demo.id);
  const visual = page.visual ? introImage(page.visual.src) : null;
  return (
    <article className="intro" aria-label={demo.title} data-still={Boolean(visual)}>
      {visual && page.visual ? (
        <figure className="intro__visual">
          {/* A captured PNG under public/intro, served as AVIF with a WebP fallback at its display
              size. width and height reserve the box before it loads. */}
          <picture>
            {visual.avifSrcSet ? <source type="image/avif" srcSet={visual.avifSrcSet} sizes={visual.sizes} /> : null}
            <img className="intro__image" src={visual.src} srcSet={visual.webpSrcSet || undefined} sizes={visual.sizes || undefined} width={visual.width} height={visual.height} alt={page.visual.alt} />
          </picture>
        </figure>
      ) : null}
      <div className="intro__text glass-dark">
        {demo.chip ? <p className="intro__group">{demo.chip}</p> : null}
        <h1 className="intro__title">{demo.title}</h1>
        <p className="intro__description">
          {page.description} {support?.since ?? ""}
        </p>
        {support ? <SupportRow tiles={support.tiles} kind={support.kind} /> : null}
        {support?.alsoUses ? <p className="intro__also">{support.alsoUses}</p> : null}
      </div>
    </article>
  );
}
