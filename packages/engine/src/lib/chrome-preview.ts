/**
 * `?chrome=<id>` previews an audience theme with no file edit. The pages are prerendered, so the
 * value is read on the client, like `glass` and `step`. It lives in the URL (lib/presenter/url.ts keeps
 * it across slides), and this module remembers it for a reader's own navigation.
 */
let remembered: string | null = null;

/** The previewed id, or null with none. Safe during server rendering. */
export function chromePreview(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("chrome");
  if (value && /^[a-z][a-z0-9-]*$/.test(value)) remembered = value;
  return remembered;
}

/** The theme a terminal frame should ask for: the preview, else the page's own. */
export function frameChrome(pageChrome: string | undefined): string | undefined {
  return chromePreview() ?? pageChrome;
}
