/**
 * The fonts the engine ships, and the only place their files are named. Each family lives under
 * assets/fonts/<id>/ with its OFL.txt, as WOFF2 latin faces at 400 and 700. `prepareDeck` copies a
 * family into public/live-ish/fonts/ only when a theme the deck resolves to uses it, and writes the
 * matching @font-face rules to /live-ish/fonts.css. A theme previewed with `?chrome=` whose family
 * was not copied falls back to the stack below, with no failed request.
 *
 * License, copyright and Reserved Font Name for each file are in THIRD_PARTY.md, read from the name
 * tables by `pnpm fonts:licenses`.
 */
export interface FontFamily {
  /** The folder under assets/fonts/. */
  id: string;
  /** The CSS family name. */
  family: string;
  /** The stack behind the family, so a missing file still reads as the same kind of face. */
  fallback: string;
  monospace: boolean;
  faces: { file: string; weight: 400 | 700 }[];
}

const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

function family(id: string, name: string, fallback: string, monospace: boolean, files: [string, string]): FontFamily {
  return { id, family: name, fallback, monospace, faces: [{ file: files[0], weight: 400 }, { file: files[1], weight: 700 }] };
}

export const FONT_FAMILIES: Record<string, FontFamily> = {
  Inter: family("inter", "Inter", SANS, false, ["inter-latin-400.woff2", "inter-latin-700.woff2"]),
  "JetBrains Mono": family("jetbrains-mono", "JetBrains Mono", MONO, true, ["jetbrains-mono-latin-400.woff2", "jetbrains-mono-latin-700.woff2"]),
  Nunito: family("nunito", "Nunito", SANS, false, ["nunito-latin-400.woff2", "nunito-latin-700.woff2"]),
  "Space Grotesk": family("space-grotesk", "Space Grotesk", SANS, false, ["space-grotesk-latin-400.woff2", "space-grotesk-latin-700.woff2"]),
  // Unmodified upstream files, never subset: see THIRD_PARTY.md.
  "Atkinson Hyperlegible": family("atkinson-hyperlegible", "Atkinson Hyperlegible", SANS, false, ["AtkinsonHyperlegible-Regular.woff2", "AtkinsonHyperlegible-Bold.woff2"]),
};

/** Where a shipped face is served from once `prepareDeck` has copied it. */
export const fontUrl = (font: FontFamily, file: string) => `/live-ish/fonts/${font.id}/${file}`;

/** A CSS stack for a theme's font: a shipped family with its fallback, or a system stack as written. */
export function fontStack(name: string): string {
  const font = FONT_FAMILIES[name];
  return font ? `"${font.family}", ${font.fallback}` : name;
}

/** @font-face rules for shipped families, by name. `swap`, so text never waits on a file. */
export function fontFaceCss(names: Iterable<string>): string {
  return [...new Set(names)]
    .flatMap((name) => {
      const font = FONT_FAMILIES[name];
      if (!font) return [];
      return font.faces.map((f) => `@font-face { font-family: "${font.family}"; font-style: normal; font-weight: ${f.weight}; font-display: swap; src: url("${fontUrl(font, f.file)}") format("woff2"); }`);
    })
    .join("\n");
}

/**
 * The faces the first paint of a demo slide draws: sans 400 and 700, mono 400. Mono 700 is left out
 * unless the mono face is also the theme's text face. Budgets are counted over this list.
 */
export function demoFaces(fonts: { sans: string; mono: string }): { url: string; shorthand: string }[] {
  const out: { url: string; shorthand: string }[] = [];
  const add = (name: string, weight: number) => {
    const font = FONT_FAMILIES[name];
    const face = font?.faces.find((f) => f.weight === weight);
    if (font && face) out.push({ url: fontUrl(font, face.file), shorthand: `${weight} 1em "${font.family}"` });
  };
  add(fonts.sans, 400);
  add(fonts.sans, 700);
  if (fonts.mono !== fonts.sans) add(fonts.mono, 400);
  return out;
}
