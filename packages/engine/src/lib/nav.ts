import type { Slide } from "../schema/slide";
import type { Demo } from "../schema/demo";
import { demos as deckDemos, slides as deckSlides } from "./content";

/**
 * The navigation drawer's list, derived from the deck: the opening, each demo section
 * by feature name in four groups, and the closing. No slide number is typed; they follow the deck.
 * Group headings are text, not links. The validator checks that every demo section appears once
 * and that every target exists.
 */

export interface NavLink {
  /** The slide the link opens: the section's first page, or the first opening or closing slide. */
  slideId: string;
  label: string;
  /** 1-based slide number, shown right-aligned. */
  number: number;
}

export interface NavGroup {
  /** Null for the opening and closing, which stand alone. */
  heading: string | null;
  links: NavLink[];
}

export function navGroups(slides: Slide[] = deckSlides, demos: Demo[] = deckDemos): NavGroup[] {
  const numberOf = new Map(slides.map((s) => [s.id, s.index]));
  const firstDemo = slides.findIndex((s) => s.layout === "demo-page");
  const lastDemo = slides.findLastIndex((s) => s.layout === "demo-page");
  const groups: NavGroup[] = [];
  if (slides.length > 0 && firstDemo !== 0) groups.push({ heading: null, links: [{ slideId: slides[0].id, label: "Opening", number: slides[0].index }] });
  for (const demo of demos) {
    const first = demo.pages[0];
    if (!first || !numberOf.has(first.id)) continue;
    const heading = demo.navGroup ?? null;
    const link: NavLink = { slideId: first.id, label: demo.title, number: numberOf.get(first.id)! };
    const last = groups[groups.length - 1];
    if (last && heading !== null && last.heading === heading) last.links.push(link);
    else groups.push({ heading, links: [link] });
  }
  const closing = lastDemo >= 0 ? slides[lastDemo + 1] : undefined;
  if (closing) groups.push({ heading: null, links: [{ slideId: closing.id, label: "Closing", number: closing.index }] });
  return groups;
}

/** Every link in order, for the validator. */
export function navLinks(slides: Slide[] = deckSlides, demos: Demo[] = deckDemos): { slideId: string; label: string }[] {
  return navGroups(slides, demos).flatMap((g) => g.links.map(({ slideId, label }) => ({ slideId, label })));
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
