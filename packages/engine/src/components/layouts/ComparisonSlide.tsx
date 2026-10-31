import type { Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { splitLead } from "../../lib/text";
import { SlideShell } from "./SlideShell";

interface Props {
  slide: Slide;
  total: number;
  mode: Mode;
}

/** Two columns, A vs B. `detail` lines render as a list; a leading "figure:" becomes the large lead. */
export function ComparisonSlide({ slide, total, mode }: Props) {
  const cols = (slide.items ?? []).slice(0, 2);
  return (
    <SlideShell slide={slide} total={total} mode={mode} headerExtra={slide.body?.[0] ? <p className="slide__subtitle">{slide.body[0]}</p> : null}>
      <div className="comparison">
        {cols.map((col) => (
          <section className="comparison__col" key={col.label} data-mono={Boolean(col.mono)}>
            <h2 className="comparison__heading">{col.label}</h2>
            {col.mono ? (
              <pre className="comparison__code">{col.detail}</pre>
            ) : (
              <ul className="comparison__lines">
                {(col.detail ?? "").split("\n").map((line, i) => {
                  const lead = splitLead(line);
                  return (
                    <li className="comparison__line" key={i}>
                      {lead ? (
                        <>
                          <strong className="comparison__lead">{lead.lead}</strong>
                          <span className="comparison__rest">{lead.rest}</span>
                        </>
                      ) : (
                        <span className="comparison__rest">{line}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </SlideShell>
  );
}
