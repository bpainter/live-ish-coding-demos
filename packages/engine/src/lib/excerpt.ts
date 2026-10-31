import type { DemoCodeLang } from "../schema/demo";

/**
 * Excerpts of a demo's files: the chosen ranges of a 44-column
 * formatted file, joined by generated elision lines in the file's comment syntax. Shared by the
 * file loader (lib/demo-files.ts), the code panel and the validator, so they agree on which shown
 * lines are elisions.
 */

export type ShownLine = { kind: "source"; line: number } | { kind: "elision"; count: number };

export function elisionText(lang: DemoCodeLang, count: number): string {
  const body = `... ${count} more line${count === 1 ? "" : "s"}`;
  switch (lang) {
    case "html":
      return `<!-- ${body} -->`;
    case "css":
      return `/* ${body} */`;
    case "yaml":
    case "bash":
    case "http":
      return `# ${body}`;
    default:
      return `// ${body}`;
  }
}

/** The shown lines of an excerpt: source lines and elisions, in order. Leading and trailing gaps get an elision too. */
export function excerptLayout(ranges: [number, number][], total: number): ShownLine[] {
  const out: ShownLine[] = [];
  let next = 1;
  // A gap of fewer than three lines is shown in full: an elision line would hide almost nothing
  // behind a line of its own.
  const gap = (from: number, to: number) => {
    if (to - from + 1 >= MIN_ELIDED) out.push({ kind: "elision", count: to - from + 1 });
    else for (let n = from; n <= to; n++) out.push({ kind: "source", line: n });
  };
  for (const [a, b] of ranges) {
    if (a > next) gap(next, a - 1);
    for (let n = a; n <= Math.min(b, total); n++) out.push({ kind: "source", line: n });
    next = b + 1;
  }
  if (next <= total) gap(next, total);
  return out;
}

/** The fewest hidden lines an elision line stands for. */
export const MIN_ELIDED = 3;

/** The shown source of an excerpt. */
export function excerptSource(full: string, ranges: [number, number][], lang: DemoCodeLang): string {
  const lines = full.replace(/\n$/, "").split("\n");
  return excerptLayout(ranges, lines.length)
    .map((l) => (l.kind === "source" ? lines[l.line - 1] : elisionText(lang, l.count)))
    .join("\n");
}

/** 1-based shown line numbers that are elisions. */
export function elisionLines(ranges: [number, number][] | undefined, total: number): number[] {
  if (!ranges) return [];
  return excerptLayout(ranges, total).flatMap((l, i) => (l.kind === "elision" ? [i + 1] : []));
}

/** Expands `[n, [a, b]]` into the set of highlighted line numbers. */
export function lineSet(lines: (number | [number, number])[]): Set<number> {
  const out = new Set<number>();
  for (const l of lines) {
    if (Array.isArray(l)) for (let n = l[0]; n <= l[1]; n++) out.add(n);
    else out.add(l);
  }
  return out;
}
