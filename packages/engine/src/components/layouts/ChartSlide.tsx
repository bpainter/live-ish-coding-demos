import type { Slide, SlideChart } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { SlideShell } from "./SlideShell";

interface Props {
  slide: Slide;
  total: number;
  mode: Mode;
}

const W = 1000;
const H = 560;
const PAD = { top: 30, right: 40, bottom: 80, left: 100 };

/** Round tick values covering 0 to `max`, about five of them. */
function ticks(max: number): number[] {
  const rough = (max || 1) / 4;
  const step = [1, 2, 2.5, 5, 10].map((m) => m * 10 ** Math.floor(Math.log10(rough))).find((s) => s >= rough) ?? rough;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step * 1000) / 1000);
}

/** One axis pair and its marks, dot or bar. Bars read `y`, in the order the author wrote them. */
function ChartMarks({ chart }: { chart: SlideChart }) {
  const bar = chart.kind === "bar";
  const yTicks = ticks(Math.max(...chart.points.map((p) => p.y), ...(chart.axisNotes ?? []).map((n) => n.y)));
  const yMax = yTicks.at(-1)!;
  const xTicks = bar ? [] : ticks(Math.max(...chart.points.map((p) => p.x)));
  const xMax = xTicks.at(-1) ?? 1;
  const plotW = W - PAD.left - PAD.right;
  const sx = (x: number) => PAD.left + (x / xMax) * plotW;
  const sy = (y: number) => H - PAD.bottom - (y / yMax) * (H - PAD.top - PAD.bottom);
  const band = plotW / chart.points.length;
  return (
    <>
      <g className="chart__axes">
        <line x1={PAD.left} y1={sy(0)} x2={W - PAD.right} y2={sy(0)} />
        <line x1={PAD.left} y1={sy(0)} x2={PAD.left} y2={PAD.top} />
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={sx(t)} y1={sy(0)} x2={sx(t)} y2={sy(0) + 8} />
            <text className="chart__tick" x={sx(t)} y={sy(0) + 32} textAnchor="middle">
              {t}
            </text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.left - 8} y1={sy(t)} x2={PAD.left} y2={sy(t)} />
            <text className="chart__tick" x={PAD.left - 14} y={sy(t) + 7} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        <text className="chart__axis-label" x={(PAD.left + W - PAD.right) / 2} y={H - 12} textAnchor="middle">
          {chart.xLabel}
        </text>
        <text className="chart__axis-label" x={24} y={(PAD.top + H - PAD.bottom) / 2} textAnchor="middle" transform={`rotate(-90 24 ${(PAD.top + H - PAD.bottom) / 2})`}>
          {chart.yLabel}
        </text>
      </g>
      {chart.axisNotes?.map((n, i) => (
        <g className="chart__note" key={n.label}>
          <line x1={PAD.left} y1={sy(n.y)} x2={W - PAD.right} y2={sy(n.y)} />
          {/* Alternate labels above and below the line so close values stay legible. */}
          <text x={W - PAD.right} y={i % 2 === 0 ? sy(n.y) - 8 : sy(n.y) + 24} textAnchor="end">
            {n.label} {n.y}
          </text>
        </g>
      ))}
      {bar
        ? chart.points.map((p, i) => (
            <g className="chart__bar" key={p.label}>
              <rect x={PAD.left + i * band + band * 0.2} y={sy(p.y)} width={band * 0.6} height={sy(0) - sy(p.y)} />
              <text x={PAD.left + i * band + band / 2} y={sy(p.y) - 10} textAnchor="middle">
                {p.y}
              </text>
              <text x={PAD.left + i * band + band / 2} y={sy(0) + 32} textAnchor="middle">
                {p.label}
              </text>
            </g>
          ))
        : chart.points.map((p) => (
            <g className="chart__point" key={p.label}>
              <circle cx={sx(p.x)} cy={sy(p.y)} r={14} />
              <text x={sx(p.x) + 24} y={sy(p.y) + 9}>
                {p.label}
              </text>
            </g>
          ))}
    </>
  );
}

/** A dot or bar chart drawn as inline SVG, with the same data in a visually hidden table. */
export function ChartSlide({ slide, total, mode }: Props) {
  const chart = slide.chart;
  if (!chart) return null;
  const bar = chart.kind === "bar";
  const describe = chart.points.map((p) => (bar ? `${p.label}: ${p.y}` : `${p.label}: ${chart.xLabel} ${p.x}, ${chart.yLabel} ${p.y}`)).join("; ");
  const notes = slide.stats ?? [];
  return (
    <SlideShell slide={slide} total={total} mode={mode} headerExtra={slide.body?.[0] ? <p className="slide__subtitle">{slide.body[0]}</p> : null}>
      <div className="chart" data-notes={notes.length > 0}>
        <figure className="chart__figure">
          {/* React 19 hoists <title> as document metadata, so the accessible name goes on aria-label instead. */}
          <svg className="chart__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMinYMin meet" role="img" aria-label={`${slide.title}. ${describe}`}>
            <ChartMarks chart={chart} />
          </svg>
          <div className="visually-hidden">
          <table>
            <caption>{slide.title}</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                {bar ? null : <th scope="col">{chart.xLabel}</th>}
                <th scope="col">{chart.yLabel}</th>
              </tr>
            </thead>
            <tbody>
              {chart.points.map((p) => (
                <tr key={p.label}>
                  <th scope="row">{p.label}</th>
                  {bar ? null : <td>{p.x}</td>}
                  <td>{p.y}</td>
                </tr>
              ))}
              {chart.axisNotes?.map((n) => (
                <tr key={n.label}>
                  <th scope="row">{n.label}</th>
                  {bar ? null : <td>not reported</td>}
                  <td>{n.y}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </figure>
        {notes.length ? (
          <aside className="chart__notes" aria-label="Notes">
            <ol className="chart__note-list">
              {notes.map((s) => (
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
