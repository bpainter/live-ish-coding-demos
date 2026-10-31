import type { FrameKind } from "../schema/demo";

/**
 * Where a step's captured poster lives. Posters hold the frame document and no chrome, so one poster
 * serves every theme, except on terminal frames: the window inside them takes the theme, so those
 * posters are keyed by theme.
 *
 *   public/posters/<page>/<step>.jpg            web, static and server pages
 *   public/posters/<page>/<theme>/<step>.jpg    terminal pages
 *
 * `live-ish capture` calls these, and captures only the themes a deck uses.
 */
export function posterUrl(page: { id: string; frame: { kind: FrameKind } }, stepId: string, theme: string | undefined): string {
  return page.frame.kind === "terminal" && theme ? `/posters/${page.id}/${theme}/${stepId}.jpg` : `/posters/${page.id}/${stepId}.jpg`;
}

/** The frame stylesheet of a theme, as `prepareDeck` serves it. */
export const frameThemeHref = (theme: string) => `/live-ish/chrome/${theme}.frame.css`;

/**
 * What `posterInputHash` adds for a page: the content hash of the theme's frame stylesheet on a
 * terminal page, and nothing on any other, so a web page's posters never go stale with a theme.
 * `versions` is `.live-ish/asset-versions.json`.
 */
export function posterThemeInput(kind: FrameKind, theme: string | undefined, versions: Record<string, string>): string {
  return kind === "terminal" && theme ? (versions[frameThemeHref(theme)] ?? "") : "";
}

/** A preview of a theme with no capture shows the loading state, never a mismatched poster. */
export function posterMatchesTheme(kind: FrameKind, pageTheme: string | undefined, shownTheme: string | undefined): boolean {
  return kind !== "terminal" || pageTheme === shownTheme;
}
