"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, Hand, Keyboard, Menu } from "lucide-react";
import { TEXT_VIEW_KEY } from "../../lib/text-view";
import { NavTrigger } from "./NavDrawer";

interface Props {
  slideIndex: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onHelp: () => void;
  /** Wakes the pill when the pointer reaches it. */
  onWake?: () => void;
  /** Pages with a live frame: the "Try the demo" toggle, bound to hands-on mode. */
  demo?: { on: boolean; toggle: () => void };
}

function useTextView(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // The attribute outlives the stage (it sits on <html>); each new pill reads it on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(document.documentElement.dataset.textView === "on");
  }, []);
  const toggle = () => {
    const next = document.documentElement.dataset.textView !== "on";
    if (next) document.documentElement.dataset.textView = "on";
    else delete document.documentElement.dataset.textView;
    try {
      if (next) sessionStorage.setItem(TEXT_VIEW_KEY, "on");
      else sessionStorage.removeItem(TEXT_VIEW_KEY);
    } catch {
      // Storage can be off (private modes); the switch still works for this page.
    }
    setOn(next);
  };
  return [on, toggle];
}

/**
 * Minimal read-later controls: the drawer, previous, counter, next, help, left to
 * right in a compact pill in the bottom right corner. Reader additions: "Try
 * the demo" on pages with a live frame, the keyboard's way into and out of hands-on mode, and
 * "Text view", which swaps the stage for reflowing text. Below 900 px wide or 500 px tall the text
 * view is automatic and its switch hides (styles/components/reading-view.css). `data-control`
 * names each button, so focus returns to the same one after a slide change.
 */
export function ReaderControls({ slideIndex, total, hasPrev, hasNext, onPrev, onNext, onHelp, onWake, demo }: Props) {
  const [textView, toggleTextView] = useTextView();
  return (
    <nav className="reader-controls" aria-label="Deck controls" onPointerEnter={onWake}>
      <NavTrigger className="reader-controls__button" label="Sections">
        <Menu aria-hidden="true" />
      </NavTrigger>
      <button type="button" className="reader-controls__button" data-control="prev" onClick={onPrev} disabled={!hasPrev} aria-label="Previous">
        <ChevronLeft aria-hidden="true" />
      </button>
      {/* Stacked in the rail: the number over the total. Read as "12 of 50". */}
      <p className="reader-controls__counter">
        <span>{slideIndex}</span>
        <span className="visually-hidden"> of </span>
        <span className="reader-controls__total">{total}</span>
      </p>
      <button type="button" className="reader-controls__button" data-control="next" onClick={onNext} disabled={!hasNext} aria-label="Next">
        <ChevronRight aria-hidden="true" />
      </button>
      {demo ? (
        <button type="button" className="reader-controls__button" data-control="demo" onClick={demo.toggle} aria-pressed={demo.on} aria-label="Try the demo" title="Try the demo">
          <Hand aria-hidden="true" />
        </button>
      ) : null}
      <button type="button" className="reader-controls__button" data-control="text" onClick={toggleTextView} aria-pressed={textView} aria-label="Text view" title="Text view">
        <FileText aria-hidden="true" />
      </button>
      <button type="button" className="reader-controls__button" data-control="help" onClick={onHelp} aria-label="Keyboard help">
        <Keyboard aria-hidden="true" />
      </button>
    </nav>
  );
}

/**
 * The audience window's pill: the menu button alone, a mouse fallback that
 * hides with the cursor. Out of the tab order: the audience window's keys belong to the clicker.
 */
export function AudienceControls() {
  return (
    <nav className="reader-controls reader-controls--audience" aria-label="Deck controls">
      <NavTrigger className="reader-controls__button" label="Sections" tabIndex={-1}>
        <Menu aria-hidden="true" />
      </NavTrigger>
    </nav>
  );
}
