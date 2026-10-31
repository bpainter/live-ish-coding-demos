import type { Metadata } from "next";
import type { ReactNode } from "react";
import { deck } from "../lib/content";
import { baseMetadata } from "../lib/seo";

/** The deck's card with no canonical: pages set their own in full (lib/seo.ts). */
export const metadata: Metadata = baseMetadata();

/** The provider's script tags, on deployed builds only. Dev, walks and captures never load them. */
function Analytics() {
  if (deck.analytics.provider !== "vercel" || !process.env.VERCEL) return null;
  return (
    <>
      <script defer src="/_vercel/insights/script.js" />
      {deck.analytics.speedInsights ? <script defer src="/_vercel/speed-insights/script.js" /> : null}
    </>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The reader's text view sets data-text-view on <html> before hydration
    // (components/page/TextViewBoot.tsx); this element only, so the attribute is not a mismatch.
    <html lang={deck.lang} suppressHydrationWarning>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
