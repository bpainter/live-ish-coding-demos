/**
 * Slide URLs for the presenter windows and reader mode.
 *
 * The presenter's URL mirror and the neighbour prefetch must build the same string, or Next's
 * segment cache misses: its keys include the search string as written. So one helper builds it,
 * keeps the window's other parameters (`glass`, `capture`, `rehearse`, `fade`, then any others in
 * name order) and leaves out `step`, which the mirror adds after the slide has rendered.
 */

/** Parameters kept across slide changes, in the order they are written after `s`. */
const KEPT = ["glass", "capture", "rehearse", "fade"] as const;
/** Parameters that belong to one slide, never carried to the next. */
const DROPPED = new Set(["s", "step"]);

/** The presenter window's URL for slide `id`: `/present?s=<id>&glass=off…`, no `step`. */
export function slideHref(id: string, location: { pathname: string; search: string } = window.location): string {
  const current = new URLSearchParams(location.search);
  const out = new URLSearchParams();
  out.set("s", id);
  for (const k of KEPT) {
    const v = current.get(k);
    if (v !== null) out.set(k, v);
  }
  const rest = [...new Set(current.keys())].filter((k) => !DROPPED.has(k) && !(KEPT as readonly string[]).includes(k)).sort();
  for (const k of rest) for (const v of current.getAll(k)) out.append(k, v);
  return `${location.pathname}?${out.toString()}`;
}

/** `slideHref` plus the step, for the mirror's `history.replaceState` once the slide is shown. */
export function slideHrefWithStep(id: string, stepIndex: number, location?: { pathname: string; search: string }): string {
  const href = slideHref(id, location);
  return stepIndex > 0 ? `${href}&step=${stepIndex}` : href;
}

/**
 * Reader mode's URL for slide `id` (`/s/<id>`, prerendered). `last` lands on the slide's last step;
 * it is only added for slides with more than one step, so the common case matches the prefetch.
 */
export function readerHref(id: string, opts: { last?: boolean } = {}): string {
  return opts.last ? `/s/${id}?step=last` : `/s/${id}`;
}
