import type { ReactNode } from "react";
import { hasFrame } from "../schema/demo";
import { slides } from "../lib/content";
import { GlassMode } from "../components/presenter/GlassMode";
import { PresenterProvider } from "../lib/presenter/context";
import { SpeakerShell, type SpeakerSlideInfo } from "../components/presenter/SpeakerView";

const slideIds = slides.map((s) => s.id);
const slideInfo: SpeakerSlideInfo[] = slides.map((s) => ({
  id: s.id,
  cumulative: s.timing.cumulative,
  hasPage: Boolean(s.page),
  frameRoute: s.page && hasFrame(s.page) ? s.page.frame.route : null,
}));

/**
 * The speaker window's shell. The provider, the footer controls and the state that outlasts a slide
 * sit here, above the prerendered `[id]` pages, so a slide move swaps only the page.
 */
export default function SpeakerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <GlassMode />
      <PresenterProvider mode="speaker" slideIds={slideIds}>
        <SpeakerShell slides={slideInfo}>{children}</SpeakerShell>
      </PresenterProvider>
    </>
  );
}
