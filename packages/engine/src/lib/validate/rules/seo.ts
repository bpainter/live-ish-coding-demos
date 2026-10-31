import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createSeo, jsonLdHtml, type JsonNode, type OgFile } from "../../seo-core";
import { jpegSize, sha256 } from "../assets";
import { copySlides, defineRule, facts, genPath, memo, readJson, whereDeck, whereSlide } from "../context";
import { OG } from "../layout";
import { STYLE_LIMITS } from "../presets";
import { OG_IMAGE_FILE, OG_META_FILE, ogHash, ogInputs, type OgMeta } from "../seo";
import type { Rule, RuleContext } from "../types";

/** Fields a node must carry. Anything the config leaves unset is omitted from the graph, so it is not here. */
const REQUIRED: Record<string, string[]> = {
  CreativeWork: ["@id", "url", "name", "description", "position", "inLanguage", "isPartOf", "author"],
  PresentationDigitalDocument: ["@id", "name", "url", "author", "inLanguage", "size", "about"],
  Person: ["@id", "name"],
  Event: ["@id", "name", "eventAttendanceMode", "performer", "workPerformed", "superEvent"],
};

/** The same code the pages run, on this deck. */
const seo = (ctx: RuleContext) => memo(ctx, "seo", () => createSeo(ctx.deck, ctx.deck.deck.hosts.site ?? "http://localhost:3000", readJson<OgFile>(genPath(ctx, OG_META_FILE))));

const deckFonts = (ctx: RuleContext) => {
  const fonts = facts(ctx).input.config.theme?.fonts;
  return [...(fonts?.sans ?? []), ...(fonts?.mono ?? [])];
};

/** Every `{ "@id": x }` reference in a node tree (objects that carry an id and nothing else). */
function references(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => references(v, out));
  else if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === "@id") out.push(String(o["@id"]));
    else for (const v of Object.values(o)) references(v, out);
  }
  return out;
}

/** Every `url` and `sameAs` value in a node tree. */
function urls(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => urls(v, out));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if ((k === "url" || k === "sameAs" || k === "image") && typeof v === "string") out.push(v);
      else if (k === "sameAs" && Array.isArray(v)) out.push(...v.map(String));
      else urls(v, out);
    }
  return out;
}

export const rules: Rule[] = [
  defineRule("seo-title", "Page titles are unique.", (ctx, add) => {
    const { slideMetadata, siteMetadata } = seo(ctx);
    const site = String(siteMetadata().title);
    const titles = new Map<string, string>();
    for (const s of ctx.deck.slides) {
      const t = String(slideMetadata(s).title);
      if (titles.has(t)) add(whereSlide(ctx, s), `The page title "${t}" repeats ${titles.get(t)}.`, { fix: "Give one of the slides its own title." });
      titles.set(t, s.id);
      if (s.layout !== "title" && t === site) add(whereSlide(ctx, s), `The page title "${t}" equals the site title.`);
    }
  }),

  defineRule("seo-description", "Descriptions fit search and share cards.", (ctx, add) => {
    const { deck } = ctx.deck;
    const max = STYLE_LIMITS.descriptionChars;
    const check = (where: string, text: string | undefined) => {
      if (text && text.length > max) add(where, `${text.length} characters, and a card shows ${max}.`);
    };
    check(whereDeck("description"), deck.description);
    for (const s of ctx.deck.slides) check(whereSlide(ctx, s, "description"), s.description);
  }, "fit"),

  defineRule("seo-description", "Each copy slide has a description of its own.", (ctx, add) => {
    for (const s of copySlides(ctx)) if (s.layout !== "title" && !s.description?.trim()) add(whereSlide(ctx, s, "description"), "The slide has no description of its own.", { fix: "Search and share cards fall back to its body." });
  }),

  defineRule("jsonld", "Each page's structured data parses and its references resolve.", (ctx, add) => {
    const { slideJsonLd, talkJsonLd, slideMetadata, ORIGIN } = seo(ctx);
    const hasEvent = Boolean(ctx.deck.deck.event);
    for (const s of ctx.deck.slides) {
      const at = whereSlide(ctx, s, "JSON-LD");
      const graph = slideJsonLd(s);
      const html = jsonLdHtml(graph);
      let parsed: typeof graph;
      try {
        parsed = JSON.parse(html);
      } catch (e) {
        add(at, `It does not parse: ${(e as Error).message}.`);
        continue;
      }
      if (JSON.stringify(parsed) !== JSON.stringify(graph)) add(at, "It does not round-trip through JSON.");
      if (/<\/?script/i.test(html)) add(at, "It contains a script tag.");
      if (parsed["@context"] !== "https://schema.org") add(at, "@context is not https://schema.org.");
      const nodes: JsonNode[] = parsed["@graph"];
      const ids = new Set(nodes.map((n) => String(n["@id"])));
      for (const n of nodes) {
        const type = String(n["@type"]);
        for (const field of REQUIRED[type] ?? []) if (n[field] === undefined || n[field] === "") add(at, `${type} has no ${field}.`);
      }
      for (const type of Object.keys(REQUIRED)) if (!(type === "Event" && !hasEvent) && !nodes.some((n) => n["@type"] === type)) add(at, `The graph has no ${type}.`);
      const node = nodes.find((n) => n["@type"] === "CreativeWork");
      if (node) {
        const canonical = new URL(String(slideMetadata(s).alternates?.canonical), ORIGIN).href;
        if (node.position !== s.index) add(at, `position ${String(node.position)} is not the slide's number, ${s.index}.`);
        if (node.url !== canonical) add(at, `url ${String(node.url)} is not the canonical ${canonical}.`);
        if (s.demo && !(Array.isArray(node.about) && node.about.length)) add(at, "A demo page has no about.");
        if (s.citations.length && !Array.isArray(node.citation)) add(at, "The slide has citations, but the graph has no citation field.");
        for (const c of (node.citation as { url: string }[] | undefined) ?? []) if (!c.url.startsWith("https:")) add(at, `The citation URL is not https: ${c.url}.`);
      }
      for (const ref of references(nodes)) if (!ids.has(ref)) add(at, `@id ${ref} does not resolve inside the graph.`);
      for (const u of urls(nodes)) if (!/^https?:\/\//.test(u)) add(at, `The URL is not absolute: ${u}.`);
    }
    const talk = talkJsonLd()["@graph"].find((n) => n["@type"] === "PresentationDigitalDocument");
    if ((talk?.hasPart as unknown[] | undefined)?.length !== ctx.deck.slides.length) add(whereDeck("order"), "The deck's hasPart does not list every slide.");
  }),

  defineRule("og-image", "The share image is the right size and matches its record.", (ctx, add) => {
    // No share image yet is a normal state: `live-ish og` writes one when the deck wants one.
    const meta = readJson<OgMeta>(genPath(ctx, OG_META_FILE));
    if (!meta) return;
    const file = path.join(ctx.root, OG_IMAGE_FILE);
    if (!existsSync(file)) return add(OG_IMAGE_FILE, "The file is missing, but .live-ish/og.json records one.", { fix: "Run live-ish og." });
    const image = readFileSync(file);
    const size = jpegSize(image);
    if (!size || size.width !== OG.width || size.height !== OG.height) add(OG_IMAGE_FILE, `It is ${size ? `${size.width} by ${size.height}` : "not a JPEG"}, and a share card is ${OG.width} by ${OG.height}.`);
    const bytes = statSync(file).size;
    if (bytes > OG.maxBytes) add(OG_IMAGE_FILE, `It is ${Math.round(bytes / 1024)} KB, and a share card holds ${OG.maxBytes / 1024} KB.`);
    if (meta.imageSha256 && sha256(image) !== meta.imageSha256) add(OG_IMAGE_FILE, "It does not match .live-ish/og.json.", { fix: "Run live-ish og." });
  }),

  defineRule("og-stale", "The share image was captured from today's inputs.", (ctx, add) => {
    const meta = readJson<OgMeta>(genPath(ctx, OG_META_FILE));
    if (!meta) return;
    const inputs = ogInputs(ctx.root, ctx.deck, deckFonts(ctx));
    if (ogHash(inputs) === meta.hash) return;
    const changed = Object.keys({ ...inputs, ...meta.inputs }).filter((k) => inputs[k] !== meta.inputs?.[k]);
    add(OG_IMAGE_FILE, `The cover changed: ${changed.join(", ") || "the inputs moved"}.`, { fix: "Run live-ish og." });
  }),

  defineRule("event-date", "A named event has a start date.", (ctx, add) => {
    const { event } = ctx.deck.deck;
    if (event && !event.startDate) add(whereDeck("event.startDate"), "The event has no start date, so its structured data ships without one.", { fix: "Set an ISO 8601 date with an offset." });
  }),
];
