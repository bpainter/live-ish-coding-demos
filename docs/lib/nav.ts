/** The docs, ordered as a path. A page not listed here fails a test. Error pages hang off `errors`. */
export const NAV: { section: string; slugs: string[] }[] = [
  { section: "Start here", slugs: ["start", "live", "limits"] },
  { section: "Write a deck", slugs: ["copy-slides", "web-demos", "terminal-demos", "steps-and-actions", "code-and-spotlights", "frame-shells", "speaker-notes", "server-demos"] },
  { section: "Look and feel", slugs: ["themes", "themes/gallery", "custom-themes"] },
  { section: "Present", slugs: ["presenting", "offline", "pacing", "stage-day", "reader-view"] },
  { section: "Ship", slugs: ["deploy", "deploy/vercel", "deploy/netlify", "deploy/cloudflare", "deploy/render", "deploy/railway", "deploy/node", "deploy/docker"] },
  { section: "Reference", slugs: ["config", "cli", "errors", "troubleshooting", "verification", "ai-tools", "upgrading"] },
  { section: "Promises", slugs: ["accessibility", "performance", "browser-support", "node-support", "parity"] },
  { section: "Project", slugs: ["architecture", "contributing", "release"] },
];

export const NAV_ORDER: string[] = NAV.flatMap((group) => group.slugs);

/** The pages either side of a slug, in reading order. */
export function neighbors(slug: string): { previous?: string; next?: string } {
  const at = NAV_ORDER.indexOf(slug);
  if (at === -1) return {};
  return { previous: NAV_ORDER[at - 1], next: NAV_ORDER[at + 1] };
}
