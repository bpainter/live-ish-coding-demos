import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deck, slides } from "../lib/content";
import { SlidePage } from "../components/stage/SlidePage";
import { ReadingView } from "../components/page/ReadingView";
import { TextViewBoot } from "../components/page/TextViewBoot";
import { jsonLdHtml, siteMetadata, talkJsonLd } from "../lib/seo";

export const metadata: Metadata = siteMetadata();

/** `/` renders slide 1; the stage rewrites the URL to `/s/[id]` on the client. */
export default function HomePage() {
  if (!deck.reader.enabled) notFound();
  const first = slides[0];
  return (
    <>
      {/* React does not hoist inline scripts; crawlers read it anywhere. */}
      {/* eslint-disable-next-line react/no-danger -- JSON-LD needs raw JSON; jsonLdHtml builds it from content and escapes "<". */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(talkJsonLd()) }} />
      <TextViewBoot />
      <ReadingView slide={first} total={slides.length} />
      <SlidePage slide={first} mode="reader" canonicalPath={`/s/${first.id}`} />
    </>
  );
}
