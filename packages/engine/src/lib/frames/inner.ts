import "server-only";
import { readFileSync } from "node:fs";
import { BASE_CSP, THEME_HREF, versioned } from "./compose";
import { presenterOriginFor } from "./origins";

/**
 * A document a frame embeds in its own iframe:
 * composed with the theme only. No runtime, no wrapper, no flag scripts and no section background:
 * the presenter never talks to it, and hooks reach it through `contentDocument`, which works
 * because it shares the frame's origin. Its CSP lets the frame (same origin) and the presenter,
 * which is the frame's own ancestor, embed it.
 */
export function innerDocument(file: string, title: string, styles: string[] = []): string {
  const body = readFileSync(/*turbopackIgnore: true*/ file, "utf8").replace(/\n$/, "");
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    `<link rel="stylesheet" href="${versioned(THEME_HREF)}">`,
    ...styles.map((href) => `<link rel="stylesheet" href="${versioned(href)}">`),
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    `<title>${title.replace(/</g, "&lt;")}</title>`,
    // The frame around it draws the surface; the document adds no margin of its own.
    "<style>body { margin: 0; }</style>",
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

/** The response for an inner document on the demo origin. */
export function innerResponse(html: string, origin: string): Response {
  const csp = BASE_CSP.replace(/ORIGIN/g, origin).replace("frame-ancestors PRESENTER", `frame-ancestors 'self' ${presenterOriginFor(origin)}`);
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" },
  });
}

/** A frame CSP that may embed same-origin documents (`frame-src` the demo origin). */
export const FRAMING_CSP = `${BASE_CSP}; frame-src ORIGIN`;
