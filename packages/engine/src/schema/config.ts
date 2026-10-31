import type { Background } from "./backgrounds";
import type { Action, Browser, DemoCodeLang, FrameKind, Key, SplitRatio, Step, SupportSource } from "./demo";
import type { ChromeThemeId } from "../lib/chrome-themes.generated";
import type { Citation, SlideConfig } from "./slide";

/** A built-in audience theme, or the id of one listed in `chrome.custom`. */
export type ChromeThemeName = ChromeThemeId | (string & {});

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
  /** Copy slides. Presenter chrome is fixed. */
  theme?: {
    /** "default", or a path to a CSS file of --deck-* tokens. */
    extends?: string;
    /** `{ "--deck-accent": "#0b57d0" }`. */
    tokens?: Record<string, string>;
    /** Font files under public/: `{ sans: ["/fonts/Face-400.woff2", "/fonts/Face-700.woff2"] }`. */
    fonts?: { sans?: string[]; mono?: string[] };
    /** The audience window's overlay. */
    grain?: boolean;
    /** The wordmark. */
    brand?: { text: string; url?: string };
  };
  /** Demo slides. */
  chrome?: {
    /** The deck default. */
    theme?: ChromeThemeName;
    /** A default for each beat: `{ before: "early-web", after: "glass" }`. */
    beats?: { before?: ChromeThemeName; after?: ChromeThemeName };
    copySlides?: boolean;
    /** Theme files, relative to the deck: `["./themes/my-theme.json"]`. */
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
  /** This page's audience theme. Wins over everything else. */
  chrome?: ChromeThemeName;
  /**
   * Frame kind "server": the app in `hosts.external` and the page to open. `base: false` leaves the
   * neutral frame-base.css out of this page's document.
   */
  frame?: { app?: string; path?: string; base?: boolean };
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
  /** This page's audience theme. */
  chrome?: ChromeThemeName;
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
  /** This demo's audience theme. */
  chrome?: ChromeThemeName;
  /** `base: false` leaves the neutral frame-base.css out of every page of this demo. */
  frame?: { base?: boolean };
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
