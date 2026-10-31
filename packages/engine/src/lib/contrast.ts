/** WCAG 2.x contrast, with the compositing a translucent surface needs. No dependencies. */

export type RGBA = [number, number, number, number];

/** A hex color or `rgb()`/`rgba()` in either syntax. Returns null for anything else. */
export function parseColor(value: string): RGBA | null {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(v)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
    if (full.length !== 6 && full.length !== 8) return null;
    const n = (i: number) => Number.parseInt(full.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), full.length === 8 ? n(6) / 255 : 1];
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (!fn) return null;
  const alpha = fn[4] === undefined ? 1 : fn[4].endsWith("%") ? Number.parseFloat(fn[4]) / 100 : Number.parseFloat(fn[4]);
  return [Number(fn[1]), Number(fn[2]), Number(fn[3]), alpha];
}

/** Every color written in a CSS value, such as each stop of a gradient. */
export function colorsIn(value: string): RGBA[] {
  return [...value.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi)].map((m) => parseColor(m[0])).filter((c): c is RGBA => c !== null);
}

/** `top` painted over `bottom`. */
export function over(top: RGBA, bottom: RGBA): RGBA {
  const a = top[3] + bottom[3] * (1 - top[3]);
  if (a === 0) return [0, 0, 0, 0];
  const mix = (i: 0 | 1 | 2) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
  return [mix(0), mix(1), mix(2), a];
}

/** Layers from the top down, ending on the opaque base. */
export function stack(...layers: RGBA[]): RGBA {
  return layers.reduceRight((below, top) => over(top, below));
}

function luminance([r, g, b]: RGBA): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The ratio of two opaque colors. */
export function ratio(a: RGBA, b: RGBA): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Rounded down, so a printed ratio never claims more than the floor it passed. */
export const floor2 = (n: number) => Math.floor(n * 100) / 100;

/** `#rrggbb` of an opaque color. */
export function toHex([r, g, b]: RGBA): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}
