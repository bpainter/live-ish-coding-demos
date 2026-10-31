import type { Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { SlideShell } from "./SlideShell";
import { SlideImage } from "./SlideImage";

interface Props {
  slide: Slide;
  total: number;
  mode: Mode;
}

/** Full-bleed image with the headline bottom-left over a navy scrim. */
export function ImageLedSlide({ slide, total, mode }: Props) {
  return (
    <SlideShell slide={slide} total={total} mode={mode} footer={false} noHeader before={<SlideImage slide={slide} variant="full-bleed" />}>
      <div className="image-led">
        {slide.eyebrow ? <p className="slide__eyebrow">{slide.eyebrow}</p> : null}
        <h1 className="slide__title" id="slide-title" tabIndex={-1}>
          {slide.title}
        </h1>
        {slide.body?.map((sentence) => (
          <p className="image-led__line" key={sentence}>
            {sentence}
          </p>
        ))}
      </div>
    </SlideShell>
  );
}
