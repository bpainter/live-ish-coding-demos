import type { AssembledDeck } from "../schema/assemble";
import { hasFrame } from "../schema/demo";

/** The sandbox every frame gets, unless a deck's build says otherwise. */
const SANDBOX = "allow-scripts allow-same-origin";

/**
 * The neutral description of a running deck that `live-ish parity` checks against: slides, pages,
 * steps, selectors, routes and frame kinds, with no content. Anything that can write this JSON can be
 * a target, so the suite does not depend on how a deck was built.
 */
export interface Manifest {
  version: 1;
  /** Names the target in reports. */
  name: string;
  slides: { id: string; layout: string }[];
  /** Every demo page, in order. An intro page has no `frame`. */
  pages: ManifestPage[];
  routes: {
    reader: string;
    present: string;
    speaker: string;
    health: string;
    frames: string;
    /** Root-level addresses frames open, such as /orders. */
    addresses: string[];
  };
  /** Overrides the suite's default selectors, for a target that renamed a class. */
  selectors?: Record<string, string>;
  /** The structured data has a session node to look for. */
  event: boolean;
  /** Query keys added to outbound links. */
  linkTags: string[];
  /** Companion servers the target was started with. */
  servers: { app: string; port: number }[];
}

export interface ManifestPage {
  id: string;
  demo: string;
  beat: string;
  steps: string[];
  frame: { kind: string; route: string; sandbox: string; flags: Record<string, boolean> } | null;
}

/** The manifest of an assembled deck. `servers` comes from the config, which the deck does not keep. */
export function deckManifest({ deck, slides, demos }: AssembledDeck, servers: { app: string; port: number }[] = []): Manifest {
  return {
    version: 1,
    name: deck.title,
    slides: slides.map((s) => ({ id: s.id, layout: s.layout })),
    pages: demos.flatMap((demo) =>
      demo.pages.map((page) => ({
        id: page.id,
        demo: demo.id,
        beat: page.beat,
        steps: page.steps.map((s) => s.id),
        frame: hasFrame(page) ? { kind: page.frame.kind, route: page.frame.route, sandbox: SANDBOX, flags: page.frame.flags ?? {} } : null,
      })),
    ),
    routes: {
      reader: "/s",
      present: "/present",
      speaker: "/speaker",
      health: "/_health",
      frames: "/demos",
      addresses: demos.flatMap((d) => d.routes ?? []).flatMap((r) => (r.method === "GET" && typeof r.path === "string" ? [r.path] : [])),
    },
    event: Boolean(deck.event),
    linkTags: Object.keys(deck.links.tag ?? {}),
    servers: servers.map(({ app, port }) => ({ app, port })),
  };
}
