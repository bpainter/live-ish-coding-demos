import type { ReactNode } from "react";
import type { Mode } from "../../lib/mode";

/**
 * A real link on a copy slide that opens in a new tab. Reader mode keeps it in the tab order. The
 * audience window and the speaker previews take it out (`tabIndex={-1}`), so the clicker's keys
 * always stay with the stage; a pointer still opens it in the audience window. Captures see no
 * change: the link adds no paint at rest.
 */
export function NewTabLink({ href, mode, rel = "noopener", className, label, children }: { href: string; mode: Mode; rel?: string; className?: string; label?: string; children: ReactNode }) {
  return (
    <a className={className} href={href} target="_blank" rel={rel} tabIndex={mode === "reader" ? undefined : -1} data-deck-link="">
      {label ? <span aria-hidden="true">{children}</span> : children}
      <span className="visually-hidden">{label ? `${label}, opens in a new tab` : ", opens in a new tab"}</span>
    </a>
  );
}
