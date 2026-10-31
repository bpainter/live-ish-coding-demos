import type { Background } from "./backgrounds";
import type { Demo, DemoPage } from "./demo";

/** The layouts a `copy` slide can take. `content` is the default. */
export type CopyLayout = "content" | "title" | "closing" | "grid" | "statement" | "section" | "quotes" | "people" | "image" | "stat" | "comparison" | "table" | "timeline" | "chart";

/** A copy layout, or one page of a demo. */
export type Layout = CopyLayout | "demo-page";

export type Citation = { text: string; url: string };

export type SlideItem = { label: string; detail?: string; icon?: string; mono?: boolean };

export type SlideImage = { src: string; alt: string; placement?: "full-bleed" | "right-half" | "background" };

export type Field = "white" | "navy" | "blue";

export type TableRow = { cells: string[]; header?: boolean };

export interface SlideChart {
  kind: "dot" | "bar";
  xLabel: string;
  yLabel: string;
  points: { label: string; x: number; y: number; source?: string }[];
  /** Labelled ticks on the y axis for points with no x value. */
  axisNotes?: { label: string; y: number }[];
}

/** A card on a `grid` slide: a number, a Lucide icon, an image, a question. */
export interface GridCard {
  num?: string;
  /** A Lucide icon name in kebab case ("square-terminal") or PascalCase ("SquareTerminal"). */
  icon?: string;
  title: string;
  body?: string;
  image?: { src: string; alt: string };
  question?: string;
}

export type GridVariant = "icons" | "portraits" | "numbered";

export type Person = { initials?: string; name: string; role: string; photo?: string };

/** What an author writes in `slides/NN-name.ts`. Fields past `background` belong to one layout. */
export interface SlideConfig {
  id: string;
  layout?: CopyLayout;
  title: string;
  eyebrow?: string;
  body?: string[];
  items?: SlideItem[];
  image?: SlideImage;
  notes?: string;
  minutes?: number;
  citations?: Citation[];
  /** For search and share cards. */
  description?: string;
  background?: Background;
  field?: Field;

  /** `title`, `statement`: the big lines. `title` falls back to the slide's title. */
  lines?: string[];
  /** `closing`: the link, and the QR code built from it at build time. */
  url?: string;
  linkLabel?: string;
  caption?: string;
  /** `grid`. */
  variant?: GridVariant;
  tone?: "light" | "dark";
  /** "center": the text and cards stack as one group, centered vertically. */
  align?: "center";
  display?: string;
  lede?: string;
  cardsEyebrow?: string;
  cards?: GridCard[];
  /** `quotes`. */
  quotes?: { text: string; cite: string }[];
  /** `people`. */
  people?: Person[];
  /** `stat`. */
  stats?: { value: string; label: string; source?: string }[];
  /** `table`. */
  tableColumns?: string[];
  tableRows?: TableRow[];
  /** `chart`. */
  chart?: SlideChart;
}

/** The content of the composed layouts (`title`, `grid`, `quotes`, `statement`, `people`, `closing`). */
export type CopyContent =
  | { kind: "title"; eyebrow?: string; lines: string[] }
  | {
      kind: "grid";
      variant: GridVariant;
      tone: "light" | "dark";
      align?: "center";
      eyebrow?: string;
      title?: string;
      display?: string;
      lede?: string;
      cardsEyebrow?: string;
      cards: GridCard[];
    }
  | { kind: "quotes"; title: string; quotes: { text: string; cite: string }[] }
  | { kind: "statement"; lines: string[] }
  | { kind: "people"; title: string; people: Person[] }
  | { kind: "closing"; eyebrow?: string; name: string; role?: string; link?: string; url?: string; caption?: string; qr?: string };

/** One slide of the assembled deck: a copy slide, or one page of a demo. */
export interface Slide {
  id: string;
  /** 1-based. */
  index: number;
  layout: Layout;
  title: string;
  eyebrow?: string;
  body?: string[];
  items?: SlideItem[];
  stats?: { value: string; label: string; source?: string }[];
  image?: SlideImage;
  citations: Citation[];
  /** The spoken notes: paragraphs split by a blank line, light markdown (lib/notes.ts). */
  notes: string;
  /** `cumulative` is computed from every earlier slide's minutes. */
  timing: { minutes: number; cumulative: number };
  description?: string;
  background?: Background;
  field?: Field;
  tableRows?: TableRow[];
  tableColumns?: string[];
  chart?: SlideChart;
  /** The composed layouts' content. */
  copy?: CopyContent;
  /** Layout "demo-page": the page and its demo. */
  page?: DemoPage;
  demo?: Omit<Demo, "routes">;
}
