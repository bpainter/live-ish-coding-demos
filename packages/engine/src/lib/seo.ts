import { readFileSync } from "node:fs";
import { deck, demos, slides } from "./content";
import { SITE } from "./frames/origins";
import { generated } from "./paths";
import { createSeo, type OgFile } from "./seo-core";

export { DESCRIPTION_MAX, clampSentences, demoAbout, demoKeywords, featureName, jsonLdHtml, slidePath, webStatusUrl, type JsonLdGraph } from "./seo-core";

/** The Open Graph card, when `live-ish og` has written one. Its name carries its input hash, so social caches refresh. */
function ogCard(): OgFile | null {
  try {
    return JSON.parse(readFileSync(/*turbopackIgnore: true*/ generated("og.json"), "utf8")) as OgFile;
  } catch {
    return null;
  }
}

export const { ORIGIN, baseMetadata, siteMetadata, slideMetadata, slideJsonLd, talkJsonLd } = createSeo({ deck, slides, demos }, SITE, ogCard());
