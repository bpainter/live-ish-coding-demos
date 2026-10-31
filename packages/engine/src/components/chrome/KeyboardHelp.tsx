"use client";

import { useEffect, useRef } from "react";
import { keyHelpFor } from "../../lib/keys";
import type { Mode } from "../../lib/mode";

interface Props {
  open: boolean;
  onClose: () => void;
  /** The window's mode: reader mode lists only the keys that work there. */
  mode: Mode;
}

export function KeyboardHelp({ open, onClose, mode }: Props) {
  const rows = keyHelpFor(mode === "reader" ? "reader" : "presenter");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog className="keyboard-help" ref={ref} onClose={onClose} aria-labelledby="keyboard-help-title">
      <h2 className="keyboard-help__title" id="keyboard-help-title">
        Keyboard
      </h2>
      <dl className="keyboard-help__list">
        {rows.map((row) => (
          <div key={row.action} style={{ display: "contents" }}>
            <dt className="keyboard-help__keys">
              {row.keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </dt>
            <dd className="keyboard-help__action">{row.action}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="keyboard-help__close" onClick={onClose}>
        Close
      </button>
    </dialog>
  );
}
