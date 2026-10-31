import type { Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { SlideShell } from "./SlideShell";

interface Props {
  slide: Slide;
  total: number;
  mode: Mode;
}

const W = 1000;
const H = 560;
const PAD = { top: 30, right: 40, bottom: 70, left: 90 };

/** Two-axis dot plot drawn as inline SVG, with the same data in a visually hidden table. */
export function ChartSlide({ slide, total, mode }: Props) {
  const chart = slide.chart;
  if (!chart) return null;
  const xMax = Math.max(70, ...chart.points.map((p) => p.x)) ;
  const yMax = 100;
  const sx = (x: number) => PAD.left + (x / xMax) * (W - PAD.left - PAD.right);
  const sy = (y: number) => H - PAD.bottom - (y / yMax) * (H - PAD.top - PAD.bottom);
  const xTicks = [0, 20, 40, 60];
  const yTicks = [0, 25, 50, 75, 100];
  return (
    <SlideShell slide={slide} total={total} mode={mode} headerExtra={slide.body?.[0] ? <p className="slide__subtitle">{slide.body[0]}</p> : null}>
      <div className="chart">
        <figure className="chart__figure">
          {/* React 19 hoists <title> as document metadata, so the accessible name goes on aria-label instead. */}
          <svg className="chart__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${slide.title}: ${chart.points.map((p) => `${p.label} ${p.x}% used, ${p.y}% satisfied`).join("; ")}`}>
            <g className="chart__axes">
              <line x1={PAD.left} y1={sy(0)} x2={W - PAD.right} y2={sy(0)} />
              <line x1={PAD.left} y1={sy(0)} x2={PAD.left} y2={PAD.top} />
              {xTicks.map((t) => (
                <g key={`x${t}`}>
                  <line x1={sx(t)} y1={sy(0)} x2={sx(t)} y2={sy(0) + 8} />
                  <text className="chart__tick" x={sx(t)} y={sy(0) + 30} textAnchor="middle">
                    {t}%
                  </text>
                </g>
              ))}
              {yTicks.map((t) => (
                <g key={`y${t}`}>
                  <line x1={PAD.left - 8} y1={sy(t)} x2={PAD.left} y2={sy(t)} />
                  <text className="chart__tick" x={PAD.left - 14} y={sy(t) + 6} textAnchor="end">
                    {t}%
                  </text>
                </g>
              ))}
              <text className="chart__axis-label" x={(PAD.left + W - PAD.right) / 2} y={H - 14} textAnchor="middle">
                {chart.xLabel}
              </text>
              <text className="chart__axis-label" x={22} y={(PAD.top + H - PAD.bottom) / 2} textAnchor="middle" transform={`rotate(-90 22 ${(PAD.top + H - PAD.bottom) / 2})`}>
                {chart.yLabel}
              </text>
            </g>
            {chart.axisNotes?.map((n, i) => (
              <g className="chart__note" key={n.label}>
                <line x1={PAD.left} y1={sy(n.y)} x2={W - PAD.right} y2={sy(n.y)} />
                {/* Alternate labels above and below the line so close values stay legible. */}
                <text x={W - PAD.right} y={i % 2 === 0 ? sy(n.y) - 8 : sy(n.y) + 24} textAnchor="end">
                  {n.label} {n.y}%
                </text>
              </g>
            ))}
            {chart.points.map((p) => (
              <g className="chart__point" key={p.label}>
                <circle cx={sx(p.x)} cy={sy(p.y)} r={16} />
                <text x={sx(p.x) + 26} y={sy(p.y) + 8}>
                  {p.label}
                </text>
              </g>
            ))}
          </svg>
          <table className="visually-hidden">
            <caption>{slide.title}</caption>
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">{chart.xLabel}</th>
                <th scope="col">{chart.yLabel}</th>
              </tr>
            </thead>
            <tbody>
              {chart.points.map((p) => (
                <tr key={p.label}>
                  <th scope="row">{p.label}</th>
                  <td>{p.x}%</td>
                  <td>{p.y}%</td>
                </tr>
              ))}
              {chart.axisNotes?.map((n) => (
                <tr key={n.label}>
                  <th scope="row">{n.label}</th>
                  <td>not reported</td>
                  <td>{n.y}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
        {slide.stats?.length ? (
          <aside className="chart__notes" aria-label="Related dates">
            <ol className="chart__note-list">
              {slide.stats.map((s) => (
                <li className="chart__note-item" key={s.value + s.label}>
                  <strong>{s.value}</strong>
                  <span>{s.label}</span>
                </li>
              ))}
            </ol>
          </aside>
        ) : null}
      </div>
    </SlideShell>
  );
}
