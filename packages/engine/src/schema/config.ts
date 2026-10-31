import type { Background } from "./backgrounds";
import type { Action, Browser, DemoCodeLang, FrameKind, Key, SplitRatio, Step, SupportSource } from "./demo";
import type { Citation, SlideConfig } from "./slide";

/** The event the deck is given at. Unset drops the Event node from the structured data. */
export interface DeckEventConfig {
  name: string;
  /** Falls back to "<name>, <city>". */
  label?: string;
  city?: string;
  region?: string;
  country?: string;
  venue?: string;
  /** ISO 8601 with an offset. */
  startDate?: string;
  organizer?: { name: string; url: string };
}

/** `deck.config.ts`. Four lines start a deck: `schemaVersion`, `title`, `order` and `speaker.name`. */
export interface DeckConfig {
  schemaVersion: 1;
  title: string;
  /** Slide ids and demo ids, in order. */
  order: string[];
  speaker: { name: string; title?: string; org?: string; url?: string };

  /** Search and share cards. Falls back to the title. */
  description?: string;
  lang?: string;
  event?: DeckEventConfig;
  links?: {
    /** Shown in the footer. */
    site?: { label: string; url: string };
    /** Query values added to outbound links only. */
    tag?: Record<string, string>;
  };
  /** Text in the right pill. Falls back to the event and the speaker. */
  footer?: string;
  /** The titles of the two walk pages. */
  beats?: { before?: string; after?: string };
  theme?: {
    extends?: string;
    tokens?: Record<string, string>;
    fonts?: { sans?: string[]; mono?: string[] };
    grain?: boolean;
    /** The wordmark. */
    brand?: { text: string; url?: string };
  };
  chrome?: {
    theme?: string;
    beats?: { before?: string; after?: string };
    copySlides?: boolean;
    custom?: string[];
  };
  hosts?: {
    /** Needed for canonical URLs when deployed. */
    site?: string;
    /** Omit for one origin. */
    frames?: string;
    /** For frame kind "server": `{ shop: "https://shop.example.com" }`. */
    external?: Record<string, string>;
  };
  servers?: { app: string; command: string; port: number }[];
  presenter?: {
    /** Serve /present and /speaker from a deployed host. */
    onHost?: boolean;
  };
  reader?: {
    enabled?: boolean;
    /** Show speaker notes in the text view. */
    notes?: boolean;
    /** Allow search engines. */
    index?: boolean;
  };
  analytics?: {
    provider?: "none" | "vercel" | "custom";
    speedInsights?: boolean;
    /** For "custom": a client module path. */
    script?: string;
  };
  timing?: {
    /** Total minutes; warns when authored minutes exceed it. */
    target?: number;
  };
  writing?: {
    preset?: "none" | "plain";
    rules?: Record<string, unknown>;
    banned?: string[];
  };
  checks?: {
    fit?: "off" | "warn" | "error";
    rules?: Record<string, unknown>;
  };
  verify?: {
    browsers?: ("chromium" | "webkit" | "firefox")[];
    chromiumArgs?: string[];
    channel?: string;
  };
}

/** A file shown on a page, from `shown()` or `excerpt()`. */
export interface ShownFile {
  file: string;
  /** Inclusive, ascending, in the file's own line numbers. Set by `excerpt()`. */
  ranges?: [number, number][];
  lang?: DemoCodeLang;
}

interface PageConfig {
  notes?: string;
  minutes?: number;
  steps: StepConfig[];
  /** Overrides the demo's `kind` for this beat. */
  kind?: FrameKind;
  files?: ShownFile[];
  split?: SplitRatio;
  /** Enhancement flags this beat understands, with their first values. */
  flags?: Record<string, boolean>;
  /** Hooks the page calls. Terminal pages always have `reset`. */
  hooks?: string[];
  /** Terminal pages: the recording under `recordings/`, by name. */
  recording?: string;
  /** Terminal pages: the title bar and the working directory. */
  window?: { title?: string; cwd?: string };
  /** Frame kind "server": the app in `hosts.external` and the page to open. */
  frame?: { app: string; path: string };
  /** Documents besides index.html that this beat serves as composed pages. */
  pages?: string[];
  /** A frame shell around the shown markup. */
  shell?: { id: string; outside?: string[]; scrolls?: boolean };
  /** The address the frame opens, when a demo's `routes.ts` serves it. */
  address?: string;
  /** Stylesheets under public/, loaded unshown. */
  styles?: string[];
  poster?: string;
  spotlightClip?: { bottom: number };
  keycap?: "above-drawer";
}

/** A step as an author writes it. Notes may be left out. */
export type StepConfig = Omit<Step, "notes"> & { notes?: string[] };

/** `intro` in `demo.ts`: a slide with no frame. */
export interface IntroConfig {
  description: string;
  visual?: { src?: string; alt: string; capture?: { beat: "before" | "after" | "single"; step: string; selector?: string } };
  notes?: string;
  minutes?: number;
}

/** `demos/<id>/demo.ts`. */
export interface DemoConfig {
  id: string;
  title: string;
  scenario: string;
  kind?: FrameKind;
  /** "single": one page, under `single`. Default: `intro`, `before`, `after`, as present. */
  beats?: "single";
  support?: SupportSource;
  chrome?: string;
  background?: Background;
  /** An intro chip above the title. */
  chip?: string;
  /** The navigation drawer's heading for this demo. */
  navGroup?: string;
  intro?: IntroConfig;
  before?: PageConfig;
  after?: PageConfig;
  single?: PageConfig & { title?: string; badge?: { text: string; missing?: Browser[] } };
  citations?: Citation[];
  cautions?: string[];
}

export type { Action, Background, Browser, Citation, FrameKind, Key, SlideConfig, SplitRatio, SupportSource };
