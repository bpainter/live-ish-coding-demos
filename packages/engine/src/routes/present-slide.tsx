import type { Metadata } from "next";
import { bySlideId, slides, deck } from "../lib/content";
import { SlidePage } from "../components/stage/SlidePage";
import { slideMetadata } from "../lib/seo";
import { RenderedSlide } from "../components/presenter/RenderedSlide";
import { speakerSlideName } from "../lib/presenter/titles";

/**
 * The audience window, prerendered once per slide. The address stays `/present?s=<id>`: `withDeck()`
 * rewrites it here before the filesystem routes, and bare `/present` to the first slide. Every other
 * parameter (`step`, `glass`, `capture`, `fade`, `rehearse`) is read on the client from
 * `window.location`, so one prerendered page serves them all. An unknown id renders on demand as the
 * first slide.
 */
interface Props {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return slides.map((s) => ({ id: s.id }));
}

/** Not indexed. A shared link still unfurls as the slide, with a canonical to its `/s/<id>` page. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const slide = bySlideId(id) ?? slides[0];
  const name = speakerSlideName(slide);
  const title = name === deck.title ? `Audience · ${deck.title}` : `Audience · ${name} · ${deck.title}`;
  return { ...slideMetadata(slide), title, robots: { index: false, follow: true } };
}

/** The stage only, following the shared presenter state. The provider lives in the layout. */
export default async function PresentPage({ params }: Props) {
  const { id } = await params;
  const slide = bySlideId(id) ?? slides[0];
  return (
    <>
      <RenderedSlide id={slide.id} />
      <SlidePage slide={slide} mode="audience" />
    </>
  );
}
