import type { Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { SlideShell } from "./SlideShell";

interface Props {
  slide: Slide;
  total: number;
  mode: Mode;
}

/** Dated markers in a row. `label` is "date · name", and `hollow` opens a marker. */
export function TimelineSlide({ slide, total, mode }: Props) {
  const items = slide.items ?? [];
  const stat = slide.stats?.[0];
  return (
    <SlideShell slide={slide} total={total} mode={mode} headerExtra={slide.body?.[0] ? <p className="slide__subtitle">{slide.body[0]}</p> : null}>
      <ol className="timeline" data-count={items.length}>
        {items.map((it) => {
          const [date, name] = it.label.split(" · ");
          return (
            <li className="timeline__item" key={it.label} data-hollow={Boolean(it.hollow)}>
              <span className="timeline__marker" aria-hidden="true" />
              <strong className="timeline__date">{date}</strong>
              {name ? <span className="timeline__name">{name}</span> : null}
              {it.detail ? <span className="timeline__detail">{it.detail}</span> : null}
            </li>
          );
        })}
      </ol>
      {stat ? (
        <p className="timeline__stat">
          <strong>{stat.value}</strong> {stat.label}
        </p>
      ) : null}
    </SlideShell>
  );
}
