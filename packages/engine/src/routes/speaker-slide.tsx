import type { Metadata } from "next";
import { bySlideId, demos, neighbours, slides, deck } from "../lib/content";
import { SlidePage } from "../components/stage/SlidePage";
import { slideMetadata } from "../lib/seo";
import { speakerWindowTitle } from "../lib/presenter/titles";
import { RenderedSlide } from "../components/presenter/RenderedSlide";
import { SpeakerView } from "../components/presenter/SpeakerView";

/**
 * The speaker window, prerendered once per slide, as the audience window is. The address stays
 * `/speaker?s=<id>`: `withDeck()` rewrites it here, and bare `/speaker` to the first slide. `step`,
 * `glass` and `rehearse` are read on the client. An unknown id renders as the first slide.
 */
interface Props {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return slides.map((s) => ({ id: s.id }));
}

/** Not indexed. The title is the window's only one, and the App Router updates it on each move. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const slide = bySlideId(id) ?? slides[0];
  return { ...slideMetadata(slide), title: speakerWindowTitle(slide, slides.length, deck.title), robots: { index: false, follow: true } };
}

/** Current and next previews and notes. The provider, controls and timer live in the layout. */
export default async function SpeakerPage({ params }: Props) {
  const { id } = await params;
  const slide = bySlideId(id) ?? slides[0];
  const { next } = neighbours(slide.id);
  return (
    <>
      <RenderedSlide id={slide.id} />
      <SpeakerView
        slide={slide}
        next={next}
        total={slides.length}
        demoPosition={slide.demo ? { n: demos.findIndex((d) => d.id === slide.demo!.id) + 1, of: demos.length } : undefined}
        current={<SlidePage slide={slide} mode="speaker-preview" embedded />}
        nextPreview={next ? <SlidePage slide={next} mode="speaker-preview" embedded passive /> : null}
      />
    </>
  );
}
