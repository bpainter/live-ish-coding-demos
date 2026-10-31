/** Edit distance between two names. */
export function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = row[j];
      row[j] = next;
    }
  }
  return row[b.length];
}

/** Candidates from nearest to farthest; ties keep their given order. */
export function rankByDistance(name: string, candidates: string[]): string[] {
  return candidates.map((c, i) => ({ c, i, d: distance(name, c) })).sort((x, y) => x.d - y.d || x.i - y.i).map((x) => x.c);
}

/** The nearest candidate, for "did you mean". */
export function nearest(name: string, candidates: string[]): string | undefined {
  return rankByDistance(name, candidates)[0];
}

/** The nearest candidate when it is close enough to be a typo, not a different word. */
export function closeTo(name: string, candidates: string[]): string | undefined {
  const best = nearest(name, candidates);
  if (best === undefined) return undefined;
  return distance(name, best) <= Math.max(2, Math.floor(name.length / 2)) ? best : undefined;
}
