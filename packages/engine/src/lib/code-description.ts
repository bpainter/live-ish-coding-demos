import type { Step } from "../schema/demo";
import { lineSet } from "./excerpt";

/**
 * Text equivalents of the code panel's highlight. The band
 * and its 4 px bar are visual only; these sentences give screen readers and the reader's text
 * view the same information. Shared by the code panel, the step announcement and the text view.
 */

/** Groups line numbers into runs: [3, 6, 7, 8] to [[3, 3], [6, 8]]. */
export function lineRuns(lines: Iterable<number>): [number, number][] {
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const n of sorted) {
    const last = runs.at(-1);
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  }
  return runs;
}

function listText(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * "Lines 12 to 16 of styles.css are highlighted.", "Line 30 of publish.yml is highlighted.", or
 * "Lines 4, 7 to 9 and 12 of app.js are highlighted." Null when no line is highlighted.
 */
export function highlightSentence(file: string, lines: Iterable<number>): string | null {
  const runs = lineRuns(lines);
  if (runs.length === 0) return null;
  const single = runs.length === 1 && runs[0][0] === runs[0][1];
  const parts = runs.map(([a, b]) => (a === b ? String(a) : `${a} to ${b}`));
  return single ? `Line ${parts[0]} of ${file} is highlighted.` : `Lines ${listText(parts)} of ${file} are highlighted.`;
}

/** "styles.css is turned off in this step." for an enhancement-off step. */
export function offSentence(file: string): string {
  return `${file} is turned off in this step.`;
}

/**
 * What a step's code shows, as one sentence: the highlighted lines of its file (elision lines are
 * never highlighted, as in the panel), or that the file is off. Null when the step shows no code
 * or highlights nothing.
 */
export function stepCodeSentence(code: Step["code"] | undefined, elisions: number[] = []): string | null {
  if (!code) return null;
  if (code.off) return offSentence(code.file);
  const skip = new Set(elisions);
  return highlightSentence(code.file, [...lineSet(code.lines)].filter((n) => !skip.has(n)));
}

/** The reader's step announcement: "Step 2 of 4: Open the menu." plus the code sentence. */
export function stepAnnouncement(index: number, count: number, label: string, codeSentence?: string | null): string {
  const head = `Step ${index + 1} of ${count}: ${label}`;
  const end = /[.!?]$/.test(head) ? "" : ".";
  return codeSentence ? `${head}${end} ${codeSentence}` : `${head}${end}`;
}
