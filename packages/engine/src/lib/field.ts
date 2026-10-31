import type { Field, Layout, Slide } from "../schema/slide";

/** The openers and closers sit on carbon: a change of light tells the room the section moved. */
const DEFAULT_FIELD: Partial<Record<Layout, Field>> = { title: "dark", statement: "dark", section: "dark", closing: "dark", image: "dark" };

/** A copy slide's field, or undefined on a demo slide, which takes its surfaces from its theme. */
export function fieldFor(slide: Slide): Field | undefined {
  if (slide.layout === "demo-page") return undefined;
  const tone = slide.copy?.kind === "grid" ? slide.copy.tone : undefined;
  return slide.field ?? (tone === "dark" ? "dark" : undefined) ?? DEFAULT_FIELD[slide.layout] ?? "light";
}
