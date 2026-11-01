/**
 * Focus survives a slide change in reader mode. The reader pill is
 * rendered by the stage, which remounts per slide, so the button that had focus is destroyed by
 * the move it started. Before the move the stage records which pill control had focus (its
 * `data-control`); the next stage focuses the same control on mount, as `focusOnArrival` does for
 * the drawer. A control that is disabled on the new slide (Next on the last one) hands focus to
 * the stage instead, so it never falls to `<body>`.
 */

let remembered: { name: string; visible: boolean } | null = null;

/** Records the focused pill control, if any. Call before navigating. */
export function rememberPillFocus() {
  const a = typeof document === "undefined" ? null : document.activeElement;
  const control = a instanceof HTMLElement ? a.closest<HTMLElement>(".reader-controls [data-control]") : null;
  // The ring shows again only if it showed before (a keyboard press, not a click).
  remembered = control?.dataset.control ? { name: control.dataset.control, visible: control.matches(":focus-visible") } : null;
}

/** Playwright's Firefox 157 ignores `focus()` here while a cross-origin frame holds focus, until the frame lets go. */
export function releaseFrame() {
  const a = document.activeElement;
  if (a instanceof HTMLIFrameElement) a.blur();
}

/**
 * Focuses the recorded control in the current pill, once. Returns true when a control was recorded
 * (focused, or the fallback ran).
 */
export function restorePillFocus(fallback: () => void): boolean {
  const r = remembered;
  remembered = null;
  if (!r) return false;
  releaseFrame();
  const el = document.querySelector<HTMLButtonElement>(`.reader-controls [data-control="${r.name}"]`);
  if (el && !el.disabled && el.checkVisibility?.() !== false) el.focus({ preventScroll: true, focusVisible: r.visible } as FocusOptions);
  else fallback();
  return true;
}
