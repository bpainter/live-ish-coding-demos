import type { Finding } from "./types";

/**
 * A finding as the terminal prints it:
 *
 *   ✖ [selector] demos/faq/demo.ts: after, step s2, spotlight
 *     "#q9" matches nothing in after/index.html.
 *     Found: #q1, #q2, #note.
 *     Docs: https://live-ish.dev/errors/selector
 */
export function formatFinding(f: Finding): string {
  return [`${f.severity === "error" ? "✖" : "!"} [${f.rule}] ${f.where}`, `  ${f.message}`, ...(f.fix ? [`  ${f.fix}`] : []), `  Docs: ${f.docs}`].join("\n");
}

export function formatFindings(findings: Finding[]): string {
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  return [...findings.map(formatFinding), `${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`].join("\n\n");
}
