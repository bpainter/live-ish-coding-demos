import type { ServerRoute } from "../lib/frames/routes";
import type { Background } from "./backgrounds";
import type { Citation } from "./slide";

export type Beat = "intro" | "before" | "after" | "single";

/** What serves a frame: a composed web page, a static page, a recorded terminal, an app of its own. */
export type FrameKind = "web" | "static" | "terminal" | "server";

export type Browser = "chrome" | "edge" | "firefox" | "safari";

export type SupportSource =
  | {
      kind: "web-features";
      /** The primary feature: "details-name". */
      id: string;
      /** 2 at most. */
      alsoUses?: string[];
      fallback?: { missing: Browser[]; text: string };
      /**
       * Compat keys the demo uses: each tile shows the highest version across these keys, and the
       * since sentence uses their latest date. For features whose whole-feature status lags the
       * parts a demo uses.
       */
      compatKeys?: string[];
    }
  | {
      kind: "tooling";
      packages: { name: string; npm: string; version: string }[];
    };

/** Frame share / code share of the walk page's 1792 px body. The 32 px gap is outside both. */
export type SplitRatio = "50/50" | "60/40";

/** Slot geometry per split on the 1920 by 1080 canvas, and the frame viewport each one implies. */
export const SPLITS: Record<SplitRatio, { frame: number; code: number; viewport: { width: number; height: number } }> = {
  "50/50": { frame: 880, code: 880, viewport: { width: 640, height: 628 } },
  "60/40": { frame: 1056, code: 704, viewport: { width: 768, height: 628 } },
};

/** The viewport of a page with no code panel: one 1792 by 864 slot. */
export const FULL_VIEWPORT = { width: 1304, height: 628 };

export interface Frame {
  kind: FrameKind;
  route: string;
  /** The design size the frame is authored for. */
  viewport: { width: number; height: number };
  /** Initial enhancement flags, such as `{ "enhance-css": true }`. */
  flags?: Record<string, boolean>;
  /** Named functions the frame exposes through `window.demoHooks`. */
  hooks?: string[];
  /** A static image for speaker previews and the offline state. */
  poster?: string;
  /** Spotlights are clipped above this frame y: a docked drawer the ring must not cross. */
  spotlightClip?: { bottom: number };
  /** Keycaps sit above a docked drawer instead of at the frame's foot. */
  keycap?: "above-drawer";
}

export type DemoCodeLang = "html" | "css" | "js" | "ts" | "tsx" | "http" | "yaml" | "bash" | "json" | "text";

export interface DemoCodeFile {
  file: string;
  lang: DemoCodeLang;
  /** Read when accessed, so an edit shows on the next request in development. */
  source: string;
  excerptOf?: {
    /** Relative to the deck root. */
    path: string;
    /** Inclusive, ascending, in the file's own line numbers. */
    ranges: [number, number][];
  };
}

export type Key = "Escape" | "Tab" | "Shift+Tab" | "Enter" | "Space" | "ArrowDown" | "ArrowUp" | "Alt+ArrowLeft" | "Alt+ArrowRight";

export type Action =
  | { type: "pointer"; to: string } // ghost cursor glides to the element
  | { type: "click"; target: string } // element.click() with a ripple on the ghost cursor
  | { type: "key"; key: Key; target?: string; via: string } // keycap caption on screen; `via` names the DOM API that produces the same effect (synthetic key events are untrusted)
  | { type: "focus"; target: string; visible?: boolean } // element.focus({ focusVisible })
  | { type: "type"; target: string; text: string } // character-by-character input events
  | { type: "paste"; target: string; text: string } // value set plus an input event, with a "Paste" keycap
  | { type: "resize"; target: string; inlineSize: string } // animate a container's inline size
  | { type: "toggle"; flag: string; on: boolean } // enhancement flag: CSS layer on or off, enhancement script on or off, CSP mode
  | { type: "navigate"; url?: string; history?: "back" | "forward" }
  | { type: "network"; profile: "fast" | "slow" }
  | { type: "hook"; name: string; args?: unknown[] } // call a named frame hook
  | { type: "terminal"; lines: [number, number] } // reveal recorded terminal lines
  | { type: "reveal"; target: string } // show a hidden element
  | { type: "wait"; ms: number } // skipped during instant replay
  | { type: "assert"; target: string; expect: string }; // rehearsal and test check only: ":popover-open", "focused", "value-length>400"

export interface Step {
  /** "s0", "s1", and so on. */
  id: string;
  /** Short, speaker window only. */
  label: string;
  actions: Action[];
  code?: {
    file: string;
    lines: (number | [number, number])[];
    /** Enhancement-off steps: dim the file, with an "Off" chip on its tab. */
    off?: boolean;
  };
  spotlight?: string[];
  callouts?: { target: string; text: string; side: "top" | "right" | "bottom" | "left" }[];
  meter?: { label: string; value: string; source: string };
  /** The one step per page to emphasise; the speaker window marks its notes. */
  key?: boolean;
  /** The step's spoken notes, one paragraph per entry (lib/notes.ts). */
  notes: string[];
  /** What to do by hand in hands-on mode. */
  ifKeyboard?: string;
  /** The claim this step proves. */
  proof?: string;
  poster?: string;
  /** False keeps this step's poster out from under the frame, when it differs from the live document. */
  posterUnderlay?: false;
  /**
   * Multi-page builds: the document this step ends on, relative to the build ("index.html",
   * "product.html?id=trail"). The forward run keeps the real navigation, so a cross-document view
   * transition plays. Instant replay opens the route with no transition, then runs the step's
   * actions after its last click or navigate.
   */
  route?: string;
}

interface PageBase {
  /** "faq-intro", "faq-before", "faq-after". */
  id: string;
  beat: Beat;
  /** The notes said on arrival: paragraphs split by a blank line (lib/notes.ts). */
  notes: string;
  /** Step 0 is the entry state. */
  steps: Step[];
  timing: { minutes: number; cumulative: number };
}

export interface IntroPage extends PageBase {
  beat: "intro";
  description: string;
  /** A captured still, when one exists under `src`. */
  visual?: {
    src: string;
    alt: string;
    capture?: { pageId: string; stepId: string; selector?: string };
  };
}

export interface WalkPage extends PageBase {
  beat: "before" | "after";
  /** The demo's title. */
  eyebrow: string;
  /** The beat's label, from `beats` in the deck config. */
  title: string;
  split: SplitRatio;
  frame: Frame;
  files: DemoCodeFile[];
}

export interface SinglePage extends PageBase {
  beat: "single";
  title: string;
  split: SplitRatio;
  frame: Frame;
  /** A support chip in the title row; missing browsers are struck through. */
  badge?: { text: string; missing?: Browser[] };
  files: DemoCodeFile[];
}

export type DemoPage = IntroPage | WalkPage | SinglePage;

/** Pages that carry a live frame: every beat but the intro. */
export type FramePage = WalkPage | SinglePage;

export function hasFrame(page: DemoPage): page is FramePage {
  return page.beat !== "intro";
}

/** A demo in the assembled deck: one folder expanded into pages, routes and timing. */
export interface Demo {
  id: string;
  /** 1..n among the deck's demos. */
  order: number;
  /** The folder, relative to the deck root: "demos/faq". */
  folder: string;
  title: string;
  /** One sentence, speaker window only. */
  scenario: string;
  background?: Background;
  support?: SupportSource;
  /** An intro chip above the title, such as "Experimental". */
  chip?: string;
  /** The heading this demo sits under in the navigation drawer. */
  navGroup?: string;
  /** An audience theme id. */
  chrome?: string;
  pages: DemoPage[];
  citations: Citation[];
  cautions: string[];
  /** Root-level addresses from `routes.ts`. */
  routes?: ServerRoute[];
}

/** The on-screen heading of a page: the demo's title on intro slides, the title elsewhere. */
export function pageHeading(demo: Pick<Demo, "title">, page: DemoPage): string {
  return page.beat === "intro" ? demo.title : page.title;
}

/** The `via` vocabulary; the validator checks the key against it. */
export const VIA_VOCABULARY = ["dialog.requestClose()", "popover.hidePopover()", "focus(target)", "el.click()", "form.requestSubmit()", "select.next()/.prev()", "navigation.back()", "navigation.forward()", "dispatch(keydown)"] as const;

/** Nominal durations used by the timing calculator, in ms. */
export const PACE = { glideMs: 420, rippleMs: 260, charMs: 45, resizeMs: 700, revealMs: 250, keyLeadMs: 150, pasteMs: 300, reloadMs: 400, navigateBudgetMs: 600, hookBudgetMs: 600 } as const;
