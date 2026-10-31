import type { Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { SlideShell } from "./SlideShell";

interface Props {
  slide: Slide;
  total: number;
  mode: Mode;
}

export function TableSlide({ slide, total, mode }: Props) {
  const columns = slide.tableColumns ?? [];
  const rows = slide.tableRows ?? (slide.items ?? []).map((it) => ({ cells: [it.label, ...(it.detail ?? "").split(" | ")] }));
  return (
    <SlideShell slide={slide} total={total} mode={mode}>
      <table className="data-table">
        <caption className="visually-hidden">{slide.title}</caption>
        {columns.length > 0 ? (
          <thead className="data-table__head">
            <tr>
              {columns.map((c) => (
                <th scope="col" key={c}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((row) => (
            <tr key={row.cells[0]}>
              {row.cells.map((cell, i) =>
                i === 0 ? (
                  <th scope="row" key={i}>
                    {cell}
                  </th>
                ) : (
                  <td key={i}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </SlideShell>
  );
}
