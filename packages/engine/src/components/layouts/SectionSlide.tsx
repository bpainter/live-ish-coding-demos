import type { Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { SlideShell } from "./SlideShell";
import { SlideImage } from "./SlideImage";

interface Props {
  slide: Slide;
  total: number;
  mode: Mode;
}

/** Section divider: label, big title, up to two lines, optional tier legend, optional right-half image. */
export function SectionSlide({ slide, total, mode }: Props) {
  const hasImage = slide.image?.placement === "right-half";
  return (
    <SlideShell slide={slide} total={total} mode={mode} titleSize="2xl" before={hasImage ? <SlideImage slide={slide} variant="right-half" /> : null}>
      {slide.body?.map((sentence) => (
        <p className="slide__text" key={sentence}>
          {sentence}
        </p>
      ))}
      {slide.items?.length ? (
        <dl className="legend">
          {slide.items.map((it) => (
            <div className="legend__item" key={it.label}>
              <dt className="legend__tier">{it.label}</dt>
              <dd className="legend__detail">{it.detail}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </SlideShell>
  );
}
