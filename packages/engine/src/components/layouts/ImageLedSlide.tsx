import type { Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { SlideImage } from "./SlideImage";
import { SlideShell, SlideTitle } from "./SlideShell";

interface Props {
  slide: Slide;
  total: number;
  mode: Mode;
}

/** A full-bleed image, with the headline on a plate at its foot. `alt` is required on every image. */
export function ImageLedSlide({ slide, total, mode }: Props) {
  return (
    <SlideShell slide={slide} total={total} mode={mode} footer={false} noHeader before={<SlideImage slide={slide} variant="full-bleed" />}>
      <div className="image-plate">
        {slide.eyebrow ? <p className="slide__eyebrow">{slide.eyebrow}</p> : null}
        <SlideTitle>{slide.title}</SlideTitle>
        {slide.body?.map((sentence) => (
          <p className="image-plate__line" key={sentence}>
            {sentence}
          </p>
        ))}
      </div>
    </SlideShell>
  );
}
