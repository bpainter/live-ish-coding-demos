import type { Slide } from "../schema/slide";
import type { Demo } from "../schema/demo";
import { demos as deckDemos, slides as deckSlides } from "./content";
import { navGroups as groupsOf, type NavGroup } from "./nav-groups";

export type { NavGroup, NavLink } from "./nav-groups";

export function navGroups(slides: Slide[] = deckSlides, demos: Demo[] = deckDemos): NavGroup[] {
  return groupsOf(slides, demos);
}

/** The link that holds slide `id` (its section, or the opening or closing), for `aria-current`. */
export function navCurrent(id: string, slides: Slide[] = deckSlides, demos: Demo[] = deckDemos): string | null {
  const slide = slides.find((s) => s.id === id);
  if (!slide) return null;
  const groups = navGroups(slides, demos);
  const links = groups.flatMap((g) => g.links);
  if (slide.layout === "demo-page") {
    const demo = demos.find((d) => d.pages.some((p) => p.id === id));
    return demo?.pages[0]?.id ?? null;
  }
  // Opening and closing slides: the nearest link at or before this slide.
  const before = links.filter((l) => l.number <= slide.index);
  return before.length ? before[before.length - 1].slideId : null;
}
