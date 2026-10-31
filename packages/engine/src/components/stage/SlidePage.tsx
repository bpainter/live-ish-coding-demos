import { preload } from "react-dom";
import { hasFrame } from "../../schema/demo";
import type { Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { slides, neighbours } from "../../lib/content";
import { navCurrent, navGroups } from "../../lib/nav";
import { backgroundCss, backgroundImage, firstPoster, introImage } from "../../lib/assets";
import { Stage } from "./Stage";
import { SlideRouter } from "./SlideRouter";

interface Props {
  slide: Slide;
  mode: Mode;
  /** When set, the stage rewrites the URL to this path on mount (used by `/`). */
  canonicalPath?: string;
  /** Render inside a box instead of filling the viewport. */
  embedded?: boolean;
  /** No keyboard, URL or store writes. */
  passive?: boolean;
}

/**
 * The images a slide shows at a step: an intro slide's captured still, or a frame page's poster for
 * that step. Only files that
 * exist under public/, at the URLs IntroSlide and DemoPageSlide render (lib/assets.ts), so the
 * decode ahead is the file the slide shows.
 */
function slideImages(slide: Slide | undefined, stepIds?: string[]): string[] {
  const page = slide?.page;
  if (!page) return [];
  if (!hasFrame(page)) {
    const still = page.visual ? introImage(page.visual.src) : null;
    return still ? [still.decodeUrl] : [];
  }
  const ids = stepIds ?? [page.steps[0]?.id].filter(Boolean);
  return ids.flatMap((id) => {
    const step = page.steps.find((s) => s.id === id);
    const poster = firstPoster(step?.poster, `/posters/${page.id}/${id}.jpg`, page.frame.poster);
    return poster ? [poster] : [];
  });
}

const groups = navGroups();

export function SlidePage({ slide, mode, canonicalPath, embedded, passive }: Props) {
  const { prev, next, position } = neighbours(slide.id);
  const afterNext = slides[position + 2];
  const background = backgroundImage(slide.background);
  // The slide's background is its LCP image: in the head at parse, not found after the CSS and the
  // inline style. Not for the speaker's next-slide preview.
  if (!passive && background?.decodeUrl.endsWith(".avif")) preload(background.decodeUrl, { as: "image", type: "image/avif", fetchPriority: "high" });
  // Decoded ahead, through the stage's module cache. The audience window and reader mode take the
  // next slide's first image and, when Back lands on the previous page's last step, that step's
  // poster. The speaker window takes what its previews show after the next press: the current
  // page's step posters, and the next two slides' first images.
  const audienceAssets = [...slideImages(next), ...(prev?.page && prev.page.steps.length > 1 ? slideImages(prev, [prev.page.steps.at(-1)!.id]) : [])];
  const speakerAssets = [...new Set([...slideImages(slide, slide.page?.steps.map((s) => s.id)), ...slideImages(next), ...slideImages(afterNext)])];
  return (
    <Stage
      key={slide.id}
      slideId={slide.id}
      slideIndex={slide.index}
      total={slides.length}
      prevId={prev?.id}
      nextId={next?.id}
      prevHasSteps={(prev?.page?.steps.length ?? 0) > 1}
      firstId={slides[0].id}
      lastId={slides[slides.length - 1].id}
      slideIds={slides.map((s) => s.id)}
      slideSteps={slides.map((s) => s.page?.steps.length ?? 0)}
      background={background?.url}
      backgroundCss={backgroundCss(slide.background)}
      neighbourBackgrounds={[prev, next].flatMap((n) => {
        const image = backgroundImage(n?.background);
        return image ? [image.decodeUrl] : [];
      })}
      neighbourAssets={mode === "audience" || mode === "reader" ? audienceAssets : mode === "speaker-preview" && !passive ? speakerAssets : []}
      nav={passive ? null : { groups, currentId: navCurrent(slide.id) }}
      steps={slide.page?.steps.map((s) => ({ label: s.label })) ?? []}
      frameRoute={slide.page && hasFrame(slide.page) ? slide.page.frame.route : undefined}
      mode={mode}
      canonicalPath={canonicalPath}
      embedded={embedded}
      passive={passive}
    >
      <SlideRouter slide={slide} total={slides.length} mode={mode} />
    </Stage>
  );
}
