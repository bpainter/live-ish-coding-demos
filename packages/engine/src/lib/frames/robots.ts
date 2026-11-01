import type { HostingMode } from "./origins";

/**
 * Link-preview bots honour robots.txt, so a shared /present or /speaker link would unfurl as a blank
 * card. They get their own group that allows those two (the pages carry noindex); a bot reads only
 * its most specific group, so the rest of the list is repeated.
 */
const PREVIEW_BOTS = ["LinkedInBot", "Twitterbot", "facebookexternalhit", "Slackbot", "Slackbot-LinkExpanding", "Discordbot", "WhatsApp", "TelegramBot", "Applebot", "redditbot", "SkypeUriPreview"];

export interface RobotsInput {
  mode: HostingMode;
  /** The `host` header. */
  host: string;
  /** The site, on two hosts. */
  site: string;
  /** The deck lets search engines in, and this is not a preview. */
  indexable: boolean;
  /** The build has `/present` and `/speaker`. */
  presenter: boolean;
  /** The addresses demos declare, frame routes with no `/demos/` prefix. */
  addresses: string[];
  /** `<origin>/sitemap.xml`. */
  sitemap: string;
}

const CLOSED = ["User-agent: *", "Disallow: /", ""].join("\n");

/** A frames host, or any other host of a two-host deck, such as a preview, is closed. */
function closedHost({ mode, host, site }: RobotsInput): boolean {
  const h = host.toLowerCase();
  if (mode === "two-hosts") return !site || h !== new URL(site).host.toLowerCase();
  return mode === "local" && h.split(":")[0] === "127.0.0.1";
}

/**
 * Frame routes are disallowed by path, so one origin keeps its reader pages and link previews with
 * no test of the host. The link-preview group exists only where `/present` does. Share images sit
 * under `/live-ish/` and stay allowed: a bot that may not fetch the image shows no image.
 */
export function robotsTxt(input: RobotsInput): string {
  if (!input.indexable || closedHost(input)) return CLOSED;
  const frames = ["Allow: /live-ish/og/", ...["/demos/", "/live-ish/", "/_health", ...input.addresses].map((p) => `Disallow: ${p}`)];
  const windows = input.presenter ? ["Disallow: /present", "Disallow: /speaker"] : [];
  return [
    ...(input.presenter ? [...PREVIEW_BOTS.map((ua) => `User-agent: ${ua}`), "Allow: /", ...frames, ""] : []),
    "User-agent: *",
    "Allow: /",
    "Allow: /s/",
    ...windows,
    ...frames,
    "",
    `Sitemap: ${input.sitemap}`,
    "",
  ].join("\n");
}
