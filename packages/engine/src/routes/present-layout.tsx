import type { ReactNode } from "react";
import { slides } from "../lib/content";
import { AddressBanner } from "../components/presenter/AddressBanner";
import { GlassMode } from "../components/presenter/GlassMode";
import { PresenterProvider } from "../lib/presenter/context";
import { AudienceView } from "../components/presenter/AudienceView";

const slideIds = slides.map((s) => s.id);

/**
 * The audience window's shell. The provider and the view sit here, above the prerendered `[id]`
 * pages, so a slide move swaps only the page: the shared state, the sync transport, the wake lock
 * and the cursor timer persist.
 */
export default function PresentLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <GlassMode />
      <AddressBanner />
      <PresenterProvider mode="audience" slideIds={slideIds}>
        <AudienceView>{children}</AudienceView>
      </PresenterProvider>
    </>
  );
}
