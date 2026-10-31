"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { Step } from "../../schema/demo";
import type { Mode } from "../../lib/mode";
import { lineSet } from "../../lib/excerpt";
import { highlightSentence } from "../../lib/code-description";
import type { PanelFile } from "./PageBody";

interface Props {
  files: PanelFile[];
  /** The step's highlighted file and lines; `off` dims the whole file and marks its tab. */
  code?: Step["code"];
  mode: Mode;
}

/**
 * Code panel of walk pages: file-name tabs, 24 px code at 44 columns
 * that never wraps, no line numbers. The highlighted band dims the rest and scrolls into view.
 * Elision lines of excerpts are dimmed and italic and never highlighted. On an enhancement-off step
 * (`code.off`) the file is dimmed and its tab carries an "Off" chip.
 *
 * Where the panel is interactive (reader mode), the file tabs follow the APG tabs pattern
 *: one tab stop, ArrowLeft, ArrowRight, Home and End move between
 * files without moving the deck, and the code is the tab panel. The highlight is also text
 * (M6): the code points to a visually hidden sentence naming the highlighted lines, and an off
 * file's tab says so. The audience window and the speaker's previews keep no tab stops.
 */
export function PageCodePanel({ files, code, mode }: Props) {
  const stepFile = code?.file ?? files[0]?.file;
  const [override, setOverride] = useState<{ step: string | undefined; file: string } | null>(null);
  const key = `${code?.file}:${JSON.stringify(code?.lines ?? [])}:${code?.off ? 1 : 0}`;
  const activeFile = override?.step === key ? override.file : stepFile;
  const file = files.find((f) => f.file === activeFile) ?? files[0];
  const elided = new Set(file?.elisions ?? []);
  const highlighted = code && !code.off && file?.file === code.file ? new Set([...lineSet(code.lines)].filter((n) => !elided.has(n))) : new Set<number>();
  const off = Boolean(code?.off && file?.file === code.file);
  const preRef = useRef<HTMLPreElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const interactive = mode !== "audience" && mode !== "speaker-preview";
  const baseId = useId();
  const tabId = (i: number) => `${baseId}-tab-${i}`;
  const panelId = `${baseId}-panel`;
  const descId = `${baseId}-desc`;
  const activeIndex = Math.max(0, files.findIndex((f) => f.file === file?.file));
  // Reader mode only: the audience window and the previews have no screen reader user to tell.
  const description = interactive && file ? highlightSentence(file.file, highlighted) : null;

  useEffect(() => {
    const pre = preRef.current;
    if (!pre) return;
    const first = pre.querySelector<HTMLElement>('.code__line[data-highlighted="true"]');
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!first) {
      pre.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      return;
    }
    const all = pre.querySelectorAll<HTMLElement>('.code__line[data-highlighted="true"]');
    const last = all[all.length - 1];
    const preRect = pre.getBoundingClientRect();
    const scale = pre.offsetWidth ? preRect.width / pre.offsetWidth : 1;
    const top = (first.getBoundingClientRect().top - preRect.top) / scale + pre.scrollTop;
    const bottom = (last.getBoundingClientRect().bottom - preRect.top) / scale + pre.scrollTop;
    // Center the highlighted range; when it is taller than the panel, show its start. The scroll
    // snaps to whole lines, so no line is cut at either edge.
    const span = bottom - top;
    const lh = first.offsetHeight || 36;
    const raw = span < pre.clientHeight ? top - (pre.clientHeight - span) / 2 : top;
    const max = pre.scrollHeight - pre.clientHeight;
    const target = Math.min(Math.max(Math.round(raw / lh) * lh, 0), Math.floor(Math.max(max, 0) / lh) * lh);
    pre.scrollTo({ top: target, behavior: reduced ? "auto" : "smooth" });
  }, [activeFile, key]);

  // APG tabs, automatic activation. The keys stop here, so the deck never sees them: ArrowRight on
  // a tab changes the file, not the step, and Home and End stay in the tab list.
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || files.length === 0) return;
    const at = activeIndex;
    const next = e.key === "ArrowRight" ? (at + 1) % files.length : e.key === "ArrowLeft" ? (at - 1 + files.length) % files.length : e.key === "Home" ? 0 : e.key === "End" ? files.length - 1 : null;
    if (next === null || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    setOverride({ step: key, file: files[next].file });
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div className="code code--page chrome-card" data-has-highlight={highlighted.size > 0} data-off={off}>
      <div className="code__tabs" role="tablist" aria-label="Files" ref={tabsRef} onKeyDown={interactive ? onTabKey : undefined}>
        {files.map((f, i) => {
          const selected = f.file === file?.file;
          const isOff = Boolean(code?.off && code.file === f.file);
          return (
            <button
              key={f.file}
              type="button"
              role="tab"
              className="code__tab"
              id={interactive ? tabId(i) : undefined}
              aria-controls={interactive ? panelId : undefined}
              aria-selected={selected}
              tabIndex={interactive && selected ? 0 : -1}
              data-interactive={interactive || undefined}
              onClick={interactive ? () => setOverride({ step: key, file: f.file }) : undefined}
            >
              {f.file}
              {isOff ? (
                <>
                  <span className="code__off-chip" aria-hidden="true">
                    Off
                  </span>
                  <span className="visually-hidden"> (turned off in this step)</span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
      <pre
        className="code__pre code__pre--plain"
        ref={preRef}
        tabIndex={interactive ? 0 : -1}
        id={interactive ? panelId : undefined}
        role={interactive ? "tabpanel" : undefined}
        aria-labelledby={interactive && files.length ? tabId(activeIndex) : undefined}
        aria-describedby={description ? descId : undefined}
      >
        <code className="code__code" data-lang={file?.lang}>
          {file?.lines.map((node, i) => (
            <span className="code__line" data-line={i + 1} data-highlighted={highlighted.has(i + 1)} data-elision={elided.has(i + 1) || undefined} key={i}>
              {node}
            </span>
          ))}
        </code>
      </pre>
      {description ? (
        <p className="visually-hidden" id={descId}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
