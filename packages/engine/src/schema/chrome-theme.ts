/**
 * A custom audience theme: `themes/<id>.json`. A theme is a token file, so it allows no raw CSS,
 * selectors or scripts. This type is the source of the file's JSON Schema.
 */
export interface ChromeThemeFile {
  /** A path to this file's JSON Schema, for editors. */
  $schema?: string;
  schemaVersion: 1;
  id: string;
  name: string;
  /** Short phrases, listed by `live-ish themes`. */
  traits: string[];
  /** `--chrome-*` and `--term-*` values. Missing tokens come from the base theme. */
  tokens?: Record<string, string>;
  /** Syntax colors: ink, keyword, string, comment, number, property. */
  code?: Record<string, string>;
  /** A system stack, or a file under `public/fonts/`. */
  fonts?: { sans?: string; mono?: string };
  /** Effects are engine code. A theme can only name one. */
  motion?: { effect?: "none" | "blink" | "marquee" | "scanlines" | "press" };
}
