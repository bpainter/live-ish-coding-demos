/**
 * Speaker notes text. Notes are plain strings with a light
 * markdown: a blank line between paragraphs, "> " lines for a quotation, "- " lines for a list,
 * and inline `code`, **bold** and *stage directions*. The speaker window and the text view render
 * the blocks; the validator and the metadata read the plain text.
 */

export type NotesBlock = { kind: "p"; text: string } | { kind: "quote"; text: string } | { kind: "list"; items: string[] };

export type NotesInline = { kind: "text" | "code" | "strong" | "em"; text: string };

/** The paragraphs, quotations and lists of a note, in order. */
export function notesBlocks(text: string): NotesBlock[] {
  return text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block): NotesBlock => {
      const lines = block.split("\n").map((l) => l.trim());
      if (lines.every((l) => l.startsWith(">"))) return { kind: "quote", text: lines.map((l) => l.replace(/^>\s?/, "")).join(" ") };
      if (lines.every((l) => l.startsWith("- "))) return { kind: "list", items: lines.map((l) => l.slice(2)) };
      return { kind: "p", text: lines.join(" ") };
    });
}

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g;

/** The runs of one paragraph: text, `code`, **bold** and *stage direction*. */
export function notesInline(text: string): NotesInline[] {
  const out: NotesInline[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > at) out.push({ kind: "text", text: text.slice(at, m.index) });
    if (m[1] !== undefined) out.push({ kind: "code", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "strong", text: m[2] });
    else out.push({ kind: "em", text: m[3] });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ kind: "text", text: text.slice(at) });
  return out;
}

const plainInline = (text: string) => notesInline(text).map((r) => r.text).join("");

/** The note without its markup: blocks on their own lines, so sentence checks split between them. */
export function notesPlain(text: string): string {
  return notesBlocks(text)
    .map((b) => (b.kind === "list" ? b.items.map(plainInline).join("\n") : plainInline(b.text)))
    .join("\n\n");
}
