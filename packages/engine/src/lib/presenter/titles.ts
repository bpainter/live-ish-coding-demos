import type { Slide } from "../../schema/slide";
import { hasFrame } from "../../schema/demo";

/**
 * A slide's name in the speaker window: eyebrow and title on framed walk pages ("Dialog element:
 * What we used to do"), else the slide title. The "Next slide" panel and the window title use it.
 */
export function speakerSlideName(slide: Slide): string {
  const page = slide.page;
  return page && hasFrame(page) && page.beat !== "single" ? `${page.eyebrow}: ${page.title}` : slide.title;
}

/**
 * The speaker window's title, set by the
 * route's `generateMetadata`, which the App Router applies on every slide move:
 * `Speaker · Dialog element: What we used to do (9/50) · <deck>`. The title slide's name is the
 * deck's, so it is not repeated.
 */
export function speakerWindowTitle(slide: Slide, total: number, deckTitle: string): string {
  const name = speakerSlideName(slide);
  const position = `(${slide.index}/${total})`;
  return name === deckTitle ? `Speaker · ${deckTitle} ${position}` : `Speaker · ${name} ${position} · ${deckTitle}`;
}
