import type { Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { SlideImage } from "./SlideImage";
import { SlideShell } from "./SlideShell";

interface Props {
  slide: Slide;
  total: number;
  mode: Mode;
}

/** Section divider: a slug, a big title, up to two lines, and a short legend. */
export function SectionSlide({ slide, total, mode }: Props) {
  const legend = slide.legend ?? slide.items;
  return (
    <SlideShell slide={slide} total={total} mode={mode} before={slide.image?.placement === "right-half" ? <SlideImage slide={slide} variant="right-half" /> : null}>
      {slide.body?.map((sentence) => (
        <p className="slide__text" key={sentence}>
          {sentence}
        </p>
      ))}
      {legend?.length ? (
        <dl className="legend">
          {legend.map((it) => (
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
