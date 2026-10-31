import type { Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { hostOf } from "../../lib/text";
import { SlideShell } from "./SlideShell";

interface Props {
  slide: Slide;
  total: number;
  mode: Mode;
}

export function StatSlide({ slide, total, mode }: Props) {
  const stats = slide.stats ?? [];
  return (
    <SlideShell slide={slide} total={total} mode={mode} headerExtra={slide.body?.[0] ? <p className="slide__subtitle">{slide.body[0]}</p> : null}>
      <dl className="stats" data-count={stats.length}>
        {stats.map((s) => (
          <div className="stats__item" key={s.value + s.label}>
            <dd className="stats__value">{s.value}</dd>
            <dt className="stats__label">{s.label}</dt>
            {s.source ? <small className="stats__source">{hostOf(s.source)}</small> : null}
          </div>
        ))}
      </dl>
    </SlideShell>
  );
}
