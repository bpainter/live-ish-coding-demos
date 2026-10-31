import { deck, demos } from "../lib/content";
import { SITE } from "../lib/frames/origins";

/**
 * Host-aware robots.txt. A frames host disallows everything. Every other host allows the reader
 * pages and disallows frame routes by path, so one origin keeps its reader pages and link previews.
 *
 * Link-preview bots honour robots.txt, so a shared /present or /speaker link would unfurl as a blank
 * card. They get their own group that allows those two (the pages carry noindex); a bot reads only
 * its most specific group, so the rest of the list is repeated.
 */
const PREVIEW_BOTS = ["LinkedInBot", "Twitterbot", "facebookexternalhit", "Slackbot", "Slackbot-LinkExpanding", "Discordbot", "WhatsApp", "TelegramBot", "Applebot", "redditbot", "SkypeUriPreview"];
const PREVIEW_ALLOWED = new Set(["/present", "/speaker"]);

function declaredAddresses(): string[] {
  return demos.flatMap((d) => d.routes ?? []).flatMap((r) => (typeof r.path === "string" ? [r.path] : []));
}

function robotsFor(host: string): string {
  const h = host.toLowerCase();
  const framesHost = deck.hosts.frames ? new URL(deck.hosts.frames).host : null;
  if (h === framesHost || h.split(":")[0] === "127.0.0.1" || !deck.reader.index) return ["User-agent: *", "Disallow: /", ""].join("\n");
  const disallow = ["/present", "/speaker", "/demos/", "/live-ish/", "/_health", ...declaredAddresses()];
  return [
    ...PREVIEW_BOTS.map((ua) => `User-agent: ${ua}`),
    "Allow: /",
    ...disallow.filter((p) => !PREVIEW_ALLOWED.has(p)).map((p) => `Disallow: ${p}`),
    "",
    "User-agent: *",
    "Allow: /",
    "Allow: /s/",
    ...disallow.map((p) => `Disallow: ${p}`),
    "",
    `Sitemap: ${SITE}/sitemap.xml`,
    "",
  ].join("\n");
}

export function GET(request: Request): Response {
  return new Response(robotsFor(request.headers.get("host") ?? ""), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" },
  });
}
