import type { Beat, FrameKind } from "../../schema/demo";
import type { ServerRoute } from "./routes";

export type BuildBeat = Exclude<Beat, "intro">;

/** One manifest per beat of a demo folder. */
export interface BuildManifest {
  /** The demo id. */
  demo: string;
  build: BuildBeat;
  kind: FrameKind;
  /** The iframe's sandbox attribute. */
  sandbox: string;
  /** Flags this build understands; a `toggle` of any other flag fails validation. */
  flags: Record<string, true>;
  enhancement: { css: "all" | "supports-blocks" | { files: string[] }; js: string[] };
  /** Scripts that only observe, served even when enhance-js is off. */
  instrumentation: string[];
  probes: { name: string; target: string; expect: string }[];
  scrollers: string[];
  /** Selectors created at runtime, exempt from the static selector check. */
  runtimeSelectors: string[];
  /** Unshown CSS for this demo's layout, root-relative, sitting in @layer frame-layout. */
  styles?: string[];
  /**
   * The frame shell around the shown markup: composed at serve time, never shown. `outside` lifts
   * ids (overlay roots) out of the shown slot; `scrolls` lets the document scroll.
   */
  shell?: { id: string; outside?: string[]; scrolls?: boolean };
  /** Overrides the base CSP. `ORIGIN` and `PRESENTER` are substituted. */
  csp?: string;
  /** The demo has a `background`: `data-section-bg` picks it up from backgrounds.css. */
  background?: boolean;
}

export interface BuildDef {
  manifest: BuildManifest;
  /** Absolute directory holding index.html and the build's other files. */
  dir: string;
  /** Files served from the build's directory, by name. All files there when omitted. */
  files?: string[];
  /** Files served beside the build from elsewhere, by name: the unshown `hooks.js`. */
  extraFiles?: Record<string, string>;
  /** The document title. */
  title: string;
  /**
   * Documents besides index.html that the build serves as composed pages, each with the theme, the
   * shell, the runtime and the instrumentation, exactly like the entry page. A link between them
   * is a real document load inside the frame.
   */
  pages?: string[];
  /**
   * Fills a page's server template before it is composed. The shown file stays as written; `url`
   * carries the page's query. Throws for an unknown record, which the route answers with a 404.
   */
  render?: (file: string, html: string, url: URL) => string;
  /** Terminal pages: the recording and the window around it. */
  terminal?: { recording: string; file: string; window: { title: string; cwd: string } };
}

export interface DemoFolder {
  /** The demo id. */
  demo: string;
  builds: Partial<Record<BuildBeat, BuildDef>>;
  /** Routes the demo adds on the frame origin (submit handlers, addresses, APIs). */
  routes?: ServerRoute[];
}
