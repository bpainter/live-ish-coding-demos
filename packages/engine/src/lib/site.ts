/**
 * The deck's public address, from `hosts.site` or LIVE_ISH_SITE_ORIGIN. Canonical URLs, Open Graph
 * URLs and JSON-LD ids sit on it. Empty on a local build with no site, whose pages then name no
 * host at all. Server code only, so no client chunk carries the address.
 */
export const SITE = process.env.LIVE_ISH_SITE ?? "";

/** Set when the build has `/present` and `/speaker`. */
export const PRESENTER_SERVED = Boolean(process.env.LIVE_ISH_PRESENTER);

/** A provider's preview deployment, which stays out of search whatever the deck allows. */
export const PREVIEW = Boolean(process.env.LIVE_ISH_PREVIEW);

/** The origin a request arrived on. A proxy must forward `host` and `x-forwarded-proto`. */
export function requestOrigin(headers: Pick<Headers, "get">, fallback: { protocol: string; host: string }): string {
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? fallback.protocol.replace(":", "");
  return `${proto}://${headers.get("host") ?? fallback.host}`;
}
