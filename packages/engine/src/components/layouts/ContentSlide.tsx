import { createElement } from "react";
import type { Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { iconByName } from "./icon";
import { SlideImage } from "./SlideImage";
import { SlideShell } from "./SlideShell";

interface Props {
  slide: Slide;
  total: number;
  mode: Mode;
}

/** The standard copy slide: eyebrow, title, one or two sentences, up to six items, and an image. */
export function ContentSlide({ slide, total, mode }: Props) {
  const items = slide.items ?? [];
  const placement = slide.image?.placement ?? "right-half";
  return (
    <SlideShell slide={slide} total={total} mode={mode} imagePlacement={slide.image ? placement : undefined} before={slide.image ? <SlideImage slide={slide} variant={placement} /> : undefined}>
      {slide.body?.map((sentence) => (
        <p className="slide__text" key={sentence}>
          {sentence}
        </p>
      ))}
      {items.length > 0 ? (
        <ul className="item-list" data-count={items.length} data-icons={items.some((it) => Boolean(iconByName(it.icon)))}>
          {items.map((item) => {
            const icon = iconByName(item.icon);
            return (
              <li className="item-list__item" key={item.label}>
                {icon ? createElement(icon, { className: "item-list__icon", "aria-hidden": true, strokeWidth: 1.75 }) : <span className="item-list__icon" aria-hidden="true" />}
                <strong className="item-list__label">{item.label}</strong>
                {item.detail ? <span className="item-list__detail">{item.detail}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </SlideShell>
  );
}
