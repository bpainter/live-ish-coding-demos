import type { Field, Layout, Slide } from "../schema/slide";

// Image-backed layouts sit on navy so their text is white over the scrimmed still.
const DEFAULT_FIELD: Partial<Record<Layout, Field>> = { title: "navy", statement: "navy", section: "navy", closing: "navy", image: "navy" };

export function fieldFor(slide: Slide): Field {
  return slide.field ?? DEFAULT_FIELD[slide.layout] ?? "white";
}
