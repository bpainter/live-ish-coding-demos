import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { deck, slides } from "../lib/content";
import { requestOrigin, SITE } from "../lib/site";
import { slidePath } from "../lib/seo";

/**
 * The reader pages: `/` and every `/s/<id>`, dated at build time. A deck with no site asks the
 * request, so no build names a host it may not run on. Reading it makes that case dynamic.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!deck.reader.enabled || !deck.reader.index) return [];
  const origin = SITE || requestOrigin(await headers(), { protocol: "http:", host: "localhost" });
  const lastModified = new Date();
  return [{ url: `${origin}/`, lastModified }, ...slides.map((s) => ({ url: `${origin}${slidePath(s)}`, lastModified }))];
}
