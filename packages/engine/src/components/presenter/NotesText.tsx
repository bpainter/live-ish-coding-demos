import { Fragment } from "react";
import { notesBlocks, notesInline } from "../../lib/notes";

/** One paragraph's runs: `code`, **bold** and *stage directions* (lib/notes.ts). */
export function NotesInlineText({ text }: { text: string }) {
  return (
    <>
      {notesInline(text).map((r, i) => {
        switch (r.kind) {
          case "code":
            return <code key={i}>{r.text}</code>;
          case "strong":
            return <strong key={i}>{r.text}</strong>;
          case "em":
            return <em key={i}>{r.text}</em>;
          default:
            return <Fragment key={i}>{r.text}</Fragment>;
        }
      })}
    </>
  );
}

/**
 * A note as paragraphs, quotations and lists, so its paragraph breaks survive. `paragraph`,
 * `quote` and `list` name the class on each block; the speaker window passes its notes classes.
 */
export function NotesText({ text, paragraph, quote, list }: { text: string; paragraph?: string; quote?: string; list?: string }) {
  return (
    <>
      {notesBlocks(text).map((b, i) =>
        b.kind === "quote" ? (
          <blockquote key={i} className={quote}>
            <p>
              <NotesInlineText text={b.text} />
            </p>
          </blockquote>
        ) : b.kind === "list" ? (
          <ul key={i} className={list}>
            {b.items.map((item, j) => (
              <li key={j}>
                <NotesInlineText text={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className={paragraph}>
            <NotesInlineText text={b.text} />
          </p>
        ),
      )}
    </>
  );
}
