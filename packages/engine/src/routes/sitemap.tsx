import type { MetadataRoute } from "next";
import { slides } from "../lib/content";
import { ORIGIN, slidePath } from "../lib/seo";

/** The reader pages: `/` and every `/s/<id>`, dated at build time. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [{ url: `${ORIGIN}/`, lastModified }, ...slides.map((s) => ({ url: `${ORIGIN}${slidePath(s)}`, lastModified }))];
}
