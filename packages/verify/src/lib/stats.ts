/** The p-th percentile by nearest rank: p90 of 50 samples is the 45th smallest. */
export function pct(xs: number[], p: number): number {
  if (!xs.length) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

/** The lower middle of an even list, so a median is always a value that was measured. */
export function median(xs: (number | null | undefined)[]): number | null {
  const s = xs.filter((x): x is number => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
}

export function percentile(xs: (number | null | undefined)[], fraction: number): number | null {
  const s = xs.filter((x): x is number => x != null);
  return s.length ? pct(s, fraction * 100) : null;
}

export const kb = (n?: number | null) => Math.round((n ?? 0) / 1024);
export const round = (n?: number | null) => (n == null ? null : Math.round(n));

/** A markdown table from rows of cells. */
export function table(head: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => (v == null ? "" : String(v));
  return [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));
