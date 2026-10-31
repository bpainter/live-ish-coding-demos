/**
 * Backgrounds are optional everywhere. A value is either a file under public/ ("/images/field.jpg"),
 * an absolute URL, or any CSS image value or token ("linear-gradient(...)", "var(--deck-field)").
 * With none, the stage and the frames fall back to the theme's own surface.
 */
export type Background = string;

/**
 * Where text sits directly on an image (stage px), and what lies between it and the image: the bare
 * field, the walk-page wash, a light card or a dark panel. The contrast checks
 * composite text over the extremes of each zone.
 */
export interface TextZone {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  on: "field" | "chrome-wash" | "light-card" | "dark-panel" | "frame";
  /** Text color on this zone: ink on light, white on dark. */
  ink: "ink" | "white";
  /** A wash the layout lays over the field under this text. */
  scrim?: { color: "ink" | "white"; alpha: number };
}

/** True when `value` names a file or URL, as opposed to a CSS value or token. */
export function isBackgroundFile(value: string): boolean {
  return value.startsWith("/") || /^https?:\/\//.test(value);
}
