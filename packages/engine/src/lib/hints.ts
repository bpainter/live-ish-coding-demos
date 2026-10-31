import type { Slide } from "../schema/slide";

/**
 * What a slide is missing that a tool could supply. These are for the author, so they reach the
 * terminal and the rehearsal overlay in `dev`. They never render on the stage, and a production build
 * has none.
 */
export function slideHints(slide: Pick<Slide, "page" | "demo">, has: { still: boolean; support: boolean }): string[] {
  const page = slide.page;
  if (page?.beat !== "intro") return [];
  const hints: string[] = [];
  if (page.visual && !has.still) hints.push(`No still at ${page.visual.src} yet. \`live-ish capture\` writes one.`);
  if (slide.demo?.support && !has.support) hints.push("No support data for this demo yet. `live-ish support --tools` fetches release dates.");
  return hints;
}
