import { deck, demos } from "../lib/content";
import { HOSTING } from "../lib/frames/origins";
import { robotsTxt } from "../lib/frames/robots";
import { PRESENTER_SERVED, PREVIEW, requestOrigin, SITE } from "../lib/site";

function declaredAddresses(): string[] {
  return demos.flatMap((d) => d.routes ?? []).flatMap((r) => (typeof r.path === "string" ? [r.path] : []));
}

export function GET(request: Request): Response {
  const url = new URL(request.url);
  const text = robotsTxt({
    mode: HOSTING.mode,
    host: request.headers.get("host") ?? url.host,
    site: HOSTING.site,
    indexable: deck.reader.enabled && deck.reader.index && !PREVIEW,
    presenter: PRESENTER_SERVED,
    addresses: declaredAddresses(),
    sitemap: `${SITE || requestOrigin(request.headers, url)}/sitemap.xml`,
  });
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" } });
}
