import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { bySlideId, slideIdByNumber, slides } from "../lib/content";
import { SlidePage } from "../components/stage/SlidePage";
import { ReadingView } from "../components/page/ReadingView";
import { TextViewBoot } from "../components/page/TextViewBoot";
import { baseMetadata, jsonLdHtml, slideJsonLd, slideMetadata } from "../lib/seo";

interface Params {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return slides.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const slide = bySlideId(id);
  return slide ? slideMetadata(slide) : baseMetadata();
}

export default async function SlideRoute({ params }: Params) {
  const { id } = await params;
  // `/s/12` redirects to the id of slide 12.
  if (/^\d+$/.test(id)) {
    const target = slideIdByNumber(Number.parseInt(id, 10));
    if (target) redirect(`/s/${target}`);
    notFound();
  }
  const slide = bySlideId(id);
  if (!slide) notFound();
  return (
    <>
      {/* eslint-disable-next-line react/no-danger -- JSON-LD needs raw JSON; jsonLdHtml builds it from content and escapes "<". */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(slideJsonLd(slide)) }} />
      {/* The session's text view switch applies before the stage paints. */}
      <TextViewBoot />
      <ReadingView slide={slide} total={slides.length} />
      <SlidePage slide={slide} mode="reader" />
    </>
  );
}
