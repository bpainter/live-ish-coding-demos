import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteAnalytics } from "../components/presenter/SiteAnalytics";
import { deck, slides } from "../lib/content";
import { versioned } from "../lib/frames/compose";
import { baseMetadata } from "../lib/seo";

/** The deck's card with no canonical: pages set their own in full (lib/seo.ts). */
export const metadata: Metadata = baseMetadata();

/**
 * The analytics adapter, on deployed builds only. Dev, walks and captures never load it. The script
 * addresses stay on this side of the client boundary, so a deck that did not choose a provider
 * ships none of its paths. Those two paths exist only on the provider, and need no package.
 */
function Analytics() {
  const { provider, speedInsights } = deck.analytics;
  if (provider === "none" || process.env.NEXT_PUBLIC_LIVE_ISH_TARGET !== "deployed") return null;
  if (provider === "custom") return <SiteAnalytics scripts={[]} custom />;
  if (process.env.NEXT_PUBLIC_LIVE_ISH_PROVIDER !== "vercel") return null;
  return <SiteAnalytics scripts={["/_vercel/insights/script.js", ...(speedInsights ? ["/_vercel/speed-insights/script.js"] : [])]} custom={false} />;
}

/**
 * The deck's faces and token overrides, and the file of each theme it resolves to. Linked once, here,
 * so a slide change between themes fetches nothing. `precedence` puts them after the engine's CSS.
 */
const STYLESHEETS = ["/live-ish/fonts.css", "/live-ish/deck.css", ...new Set(slides.flatMap((s) => (s.chrome ? [`/live-ish/chrome/${s.chrome}.css`] : [])))];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The reader's text view sets data-text-view on <html> before hydration
    // (components/page/TextViewBoot.tsx); this element only, so the attribute is not a mismatch.
    <html lang={deck.lang} suppressHydrationWarning>
      <body>
        {STYLESHEETS.map((href) => (
          <link key={href} rel="stylesheet" href={versioned(href)} precedence="high" />
        ))}
        {children}
        <Analytics />
      </body>
    </html>
  );
}
