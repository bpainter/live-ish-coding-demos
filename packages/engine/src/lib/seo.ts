import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import type { CopyContent, Slide } from "../schema/slide";
import type { Demo } from "../schema/demo";
import { deck, demos, slides } from "./content";
import { SITE } from "./frames/origins";
import { notesPlain } from "./notes";
import { generated } from "./paths";

/**
 * Metadata and JSON-LD for the presenter's pages. Every route builds its
 * full metadata from these helpers, so none depends on Next's shallow merge of `openGraph`.
 * Canonical URLs, Open Graph URLs and JSON-LD ids all sit on NEXT_PUBLIC_PRESENTER_ORIGIN.
 */

export const ORIGIN = SITE;
/** `lang` as Open Graph writes it: "en-CA" is "en_CA". */
export const LOCALE = deck.lang.replace("-", "_");
export const LANGUAGE = deck.lang;
/** At most this many characters in a description. */
export const DESCRIPTION_MAX = 160;

/** The deck's description, for the site and the title slide. */
export const SITE_DESCRIPTION = deck.description;

interface OgFile {
  hash: string;
  width: number;
  height: number;
}

/** The Open Graph card, when `live-ish og` has written one. Its name carries its input hash, so social caches refresh. */
function ogCard(): OgFile | null {
  try {
    return JSON.parse(readFileSync(/*turbopackIgnore: true*/ generated("og.json"), "utf8")) as OgFile;
  } catch {
    return null;
  }
}

const og = ogCard();

/** Who gave the deck, for the card's alt text and JSON-LD. */
const BYLINE = [deck.event?.label, deck.speaker.name, deck.role].filter(Boolean).join(". ");

export const OG_IMAGE = og ? { path: `/live-ish/og/cover.jpg?v=${og.hash.slice(0, 8)}`, width: og.width, height: og.height, type: "image/jpeg", alt: `Cover slide: ${deck.title}. ${BYLINE}.` } : null;
export const OG_IMAGE_URL = OG_IMAGE ? `${ORIGIN}${OG_IMAGE.path}` : undefined;

/** Appended to every page title: the event, when there is one, and the speaker. */
export const TITLE_SUFFIX = [deck.event?.name, deck.speaker.name].filter(Boolean).join(" | ");
export const SITE_TITLE = `${deck.title} | ${TITLE_SUFFIX}`;

const ID = {
  talk: `${ORIGIN}/#talk`,
  speaker: `${ORIGIN}/#speaker`,
  session: `${ORIGIN}/#session`,
  slide: (id: string) => `${ORIGIN}/s/${id}#slide`,
};

export function slidePath(slide: Pick<Slide, "id">): string {
  return `/s/${slide.id}`;
}

// --------------------------------------------------------------- titles and descriptions

/**
 * The slide's own title: `${eyebrow}: ${title}` on walk pages (pages share each title), the feature name on intro pages, the label elsewhere. The cover says where it was given.
 */
export function slideTitle(slide: Slide): string {
  const page = slide.page;
  if (page && (page.beat === "before" || page.beat === "after")) return `${page.eyebrow}: ${page.title}`;
  if (slide.layout === "title") return deck.title;
  return slide.title;
}

/**
 * The document and share title of `/s/<id>`: the slide's own title, then the event and speaker.
 * The cover is the talk itself, so it shares the site title; og:site_name carries the talk name
 * on every other card.
 */
export function slidePageTitle(slide: Slide): string {
  return `${slideTitle(slide)} | ${TITLE_SUFFIX}`;
}

/** Whole sentences up to `max` characters; a first sentence that is too long is cut at a word. */
export function clampSentences(text: string, max = DESCRIPTION_MAX): string {
  const parts = text.replace(/\s+/g, " ").trim().split(/(?<=[.?!])\s+/);
  let out = "";
  for (const p of parts) {
    const next = out ? `${out} ${p}` : p;
    if (next.length > max) break;
    out = next;
  }
  if (out) return out;
  const cut = parts[0].slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "")}…`;
}

/** The writing rules' sentence length to aim for. */
const SHORT_SENTENCE = 15;
const asSentence = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);

function copyDescription(g: CopyContent): string {
  switch (g.kind) {
    case "title":
      return SITE_DESCRIPTION;
    case "grid": {
      // The lede's short sentences, then the card titles; clampSentences keeps what fits.
      const lede = g.lede ? g.lede.split(/(?<=[.?!])\s+/).filter((s) => s.split(/\s+/).length <= SHORT_SENTENCE) : [];
      return [g.display, ...lede, ...g.cards.map((c) => c.title)].filter(Boolean).map((s) => asSentence(s!)).join(" ");
    }
    case "quotes":
      return `${g.title}: ${g.quotes.map((q) => q.cite).join(" and ")}.`;
    case "statement":
      return asSentence(g.lines.join(" "));
    case "people": {
      // As many names as keep the sentence at 15 words.
      let names: string[] = [];
      for (const p of g.people) {
        const next = [...names, p.name];
        if (`${g.title}: ${next.join(", ")} and more.`.split(/\s+/).length > SHORT_SENTENCE) break;
        names = next;
      }
      return `${g.title}: ${names.join(", ")} and more.`;
    }
    case "closing":
      return `Thank you from ${[deck.speaker.name, deck.role].filter(Boolean).join(", ")}.`;
  }
}

/**
 * A walk or single page's intro is the speaker's opening notes (lib/notes.ts): the description
 * takes its plain text, and its short sentences when it has any, as the grid ledes do.
 */
function spokenDescription(intro: string): string {
  const all = notesPlain(intro).split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
  const short = all.filter((s) => s.split(/\s+/).length <= SHORT_SENTENCE);
  return (short.length ? short : all).join(" ");
}

/**
 * The slide's description, 160 characters at most: the one written for it in
 * content/descriptions.ts, else the section's description on intro pages, the page intro on walk and single pages, the lede or card titles on grid slides.
 */
export function slideDescription(slide: Slide): string {
  if (slide.description) return clampSentences(slide.description);
  const page = slide.page;
  let text: string;
  if (page) text = page.beat === "intro" ? page.description : spokenDescription(page.notes);
  else if (slide.copy) text = copyDescription(slide.copy);
  else text = slide.body?.join(" ") ?? slide.title;
  return clampSentences(text);
}

// --------------------------------------------------------------- metadata

function shared(title: string, description: string, url?: string): Metadata {
  return {
    metadataBase: new URL(ORIGIN),
    title,
    description,
    authors: [{ name: deck.speaker.name, url: deck.speaker.url }],
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: {
      type: "website",
      siteName: deck.title,
      locale: LOCALE,
      ...(url ? { url } : {}),
      title,
      description,
      ...(OG_IMAGE ? { images: [{ url: OG_IMAGE.path, width: OG_IMAGE.width, height: OG_IMAGE.height, type: OG_IMAGE.type, alt: OG_IMAGE.alt }] } : {}),
    },
    twitter: {
      card: OG_IMAGE ? "summary_large_image" : "summary",
      title,
      description,
      ...(OG_IMAGE ? { images: [{ url: OG_IMAGE.path, alt: OG_IMAGE.alt }] } : {}),
    },
  };
}

/** The root layout's base: every page that sets nothing else (404s) shares the talk's card, with no canonical. */
export function baseMetadata(): Metadata {
  return shared(SITE_TITLE, SITE_DESCRIPTION);
}

/** `/`: the talk. */
export function siteMetadata(): Metadata {
  return shared(SITE_TITLE, SITE_DESCRIPTION, "/");
}

/** `/s/<id>`, and the slide named by `?s=` on `/present` and `/speaker`. */
export function slideMetadata(slide: Slide): Metadata {
  return shared(slidePageTitle(slide), slideDescription(slide), slidePath(slide));
}

// --------------------------------------------------------------- JSON-LD

type Node = Record<string, unknown>;
export interface JsonLdGraph {
  "@context": "https://schema.org";
  "@graph": Node[];
}

/** A web-features id as a name: "invoker-commands" reads "Invoker commands". */
export function featureName(id: string): string {
  const plain = id.replace(/-/g, " ");
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}
export const webStatusUrl = (id: string) => `https://webstatus.dev/features/${id}`;

/** `about`: the demo's title, then what it also uses, from its support source. */
export function demoAbout(demo: Omit<Demo, "routes">): Node[] {
  const s = demo.support;
  const name = demo.title;
  if (!s) return [{ "@type": "Thing", name }];
  if (s.kind === "web-features")
    return [
      { "@type": "Thing", name, sameAs: webStatusUrl(s.id) },
      ...(s.alsoUses ?? []).map((id) => ({ "@type": "Thing", name: featureName(id), sameAs: webStatusUrl(id) })),
    ];
  return [{ "@type": "Thing", name }, ...s.packages.map((p) => ({ "@type": "SoftwareApplication", name: p.name, applicationCategory: "DeveloperApplication", sameAs: `https://www.npmjs.com/package/${p.npm}` }))];
}

/** `keywords`: the web-features ids and "Baseline", or the tooling package names. */
export function demoKeywords(demo: Omit<Demo, "routes">): string[] {
  const s = demo.support;
  if (!s) return [demo.title];
  if (s.kind === "web-features") return [s.id, ...(s.alsoUses ?? []), "Baseline"];
  return [demo.title, ...s.packages.map((p) => p.name)];
}

const sameAs = [deck.speaker.url, deck.links.site?.url].filter(Boolean);

function personNode(): Node {
  return {
    "@type": "Person",
    "@id": ID.speaker,
    name: deck.speaker.name,
    ...(deck.speaker.title ? { jobTitle: deck.speaker.title } : {}),
    ...(deck.speaker.url ? { url: deck.speaker.url } : {}),
    ...(deck.speaker.org ? { worksFor: { "@type": "Organization", name: deck.speaker.org } } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

/** The Event node, when the deck names one. Fields it leaves unset are omitted. */
function eventNode(): Node | null {
  const e = deck.event;
  if (!e) return null;
  const organizer = e.organizer ? { "@type": "Organization", name: e.organizer.name, url: e.organizer.url } : undefined;
  const address = { ...(e.city ? { addressLocality: e.city } : {}), ...(e.region ? { addressRegion: e.region } : {}), ...(e.country ? { addressCountry: e.country } : {}) };
  const location: Node | undefined = e.venue || Object.keys(address).length ? { "@type": "Place", ...(e.venue ? { name: e.venue } : {}), ...(Object.keys(address).length ? { address: { "@type": "PostalAddress", ...address } } : {}) } : undefined;
  return {
    "@type": "Event",
    "@id": ID.session,
    name: deck.title,
    description: SITE_DESCRIPTION,
    ...(e.startDate ? { startDate: e.startDate } : {}),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    inLanguage: LANGUAGE,
    ...(OG_IMAGE_URL ? { image: OG_IMAGE_URL } : {}),
    url: `${ORIGIN}/`,
    ...(location ? { location } : {}),
    ...(organizer ? { organizer } : {}),
    performer: { "@id": ID.speaker },
    workPerformed: { "@id": ID.talk },
    superEvent: { "@type": "Event", name: e.name, ...(organizer ? { organizer } : {}), ...(location ? { location } : {}) },
  };
}

function talkNode(withParts: boolean): Node {
  return {
    "@type": "PresentationDigitalDocument",
    "@id": ID.talk,
    name: deck.title,
    description: SITE_DESCRIPTION,
    url: `${ORIGIN}/`,
    author: { "@id": ID.speaker },
    inLanguage: LANGUAGE,
    ...(OG_IMAGE_URL ? { image: OG_IMAGE_URL } : {}),
    // `numberOfPages` belongs to Book only in schema.org; `size` is the CreativeWork property for a count.
    size: { "@type": "QuantitativeValue", value: slides.length, unitText: "slides" },
    about: demos.map((d) => demoAbout(d)[0]),
    ...(withParts ? { hasPart: slides.map((s) => ({ "@type": "CreativeWork", "@id": ID.slide(s.id), url: `${ORIGIN}${slidePath(s)}`, name: slideTitle(s), position: s.index })) } : {}),
  };
}

/** The slide's own node. Demo pages take their section's about, keywords and citations. */
function slideNode(slide: Slide): Node {
  const demo = slide.demo;
  return {
    "@type": "CreativeWork",
    "@id": ID.slide(slide.id),
    url: `${ORIGIN}${slidePath(slide)}`,
    name: slideTitle(slide),
    description: slideDescription(slide),
    position: slide.index,
    inLanguage: LANGUAGE,
    isPartOf: { "@id": ID.talk },
    author: { "@id": ID.speaker },
    ...(OG_IMAGE_URL ? { image: OG_IMAGE_URL } : {}),
    ...(demo ? { about: demoAbout(demo), keywords: demoKeywords(demo) } : {}),
    ...(slide.citations.length ? { citation: slide.citations.map((c) => ({ "@type": "CreativeWork", name: c.text, url: c.url })) } : {}),
  };
}

/** `/s/<id>`: the slide, plus the talk, the speaker and the session, so each page stands alone. */
export function slideJsonLd(slide: Slide): JsonLdGraph {
  return { "@context": "https://schema.org", "@graph": [slideNode(slide), talkNode(false), personNode(), eventNode()].filter((n): n is Node => n !== null) };
}

/** `/`: the talk with every slide as a part, the speaker and the session. */
export function talkJsonLd(): JsonLdGraph {
  return { "@context": "https://schema.org", "@graph": [talkNode(true), personNode(), eventNode()].filter((n): n is Node => n !== null) };
}

/** JSON for an inline `<script type="application/ld+json">`; `<` is escaped so no text can close the script. */
export function jsonLdHtml(graph: JsonLdGraph): string {
  return JSON.stringify(graph).replace(/</g, "\\u003c");
}
