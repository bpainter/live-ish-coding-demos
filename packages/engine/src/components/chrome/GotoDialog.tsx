"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  total: number;
  onGo: (n: number) => void;
  onClose: () => void;
}

/** `g`: type a slide number, Enter to jump (speaker view only). */
export function GotoDialog({ open, total, onGo, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      setValue("");
      el.showModal();
    }
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog className="goto" ref={ref} onClose={onClose} aria-labelledby="goto-title">
      <form
        className="goto__form"
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number.parseInt(value, 10);
          if (Number.isFinite(n) && n >= 1 && n <= total) onGo(n);
          onClose();
        }}
      >
        <label className="goto__label" id="goto-title" htmlFor="goto-number">
          Go to slide
        </label>
        <input className="goto__input" id="goto-number" type="number" min={1} max={total} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        <button type="submit" className="goto__button">
          Go
        </button>
      </form>
    </dialog>
  );
}
