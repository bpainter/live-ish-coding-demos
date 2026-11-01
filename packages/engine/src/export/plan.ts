import { flagFile } from "../lib/frames/origins";
import { flagsAt, flagsBefore, segments } from "../lib/engine/steps";
import type { AssembledDeck } from "../schema/assemble";
import { hasFrame, type Demo, type FramePage } from "../schema/demo";

/** A frame the export writes as files: one document per flag combination its steps can reach. */
export interface LiveFrame {
  route: string;
  /** Each combination's flags, and the file that holds its document. */
  documents: { flags: Record<string, boolean>; file: string }[];
  /** The folder of the frame's own files, relative to the deck. */
  dir: string;
}

export interface ExportPlan {
  live: LiveFrame[];
  /** Frames a static host can't run, each of which shows its poster and a note. */
  posters: { route: string; why: string }[];
}

/** Every flag combination a document of this page can mount with, forward or in a replay. */
export function flagCombinations(page: FramePage): Record<string, boolean>[] {
  const known = new Map<string, Record<string, boolean>>();
  const add = (flags: Record<string, boolean>) => known.set(flagFile(flags), flags);
  add(flagsAt(page, 0));
  page.steps.forEach((step, i) => {
    add(flagsAt(page, i));
    for (const segment of segments(step, flagsBefore(page, i))) add(segment.flags);
  });
  return [...known.values()];
}

/** Why a frame can't run from files, or null when it can. */
function posterReason(demo: Demo, page: FramePage, combinations: number): string | null {
  const { frame } = page;
  if (frame.kind === "server") return "it is a server of its own";
  if (demo.routes?.length) return "it has server routes";
  if (!frame.route.startsWith("/demos/")) return "it opens an address a server answers";
  // A <meta> policy can't report, so the page's own proof that a policy matters has nothing to show.
  if ("csp-enforce" in (frame.flags ?? {}) || page.steps.some((s) => s.actions.some((a) => a.type === "toggle" && a.flag === "csp-enforce"))) return "it needs csp-enforce";
  // Links between a build's pages carry flags in a query, which a static host ignores.
  if (combinations > 1 && page.steps.some((s) => s.route)) return "it changes flags across several documents";
  return null;
}

/** Decides, from the deck alone, what the export writes and what falls back to a poster. */
export function planExport({ demos }: Pick<AssembledDeck, "demos">): ExportPlan {
  const plan: ExportPlan = { live: [], posters: [] };
  for (const demo of demos) {
    for (const page of demo.pages) {
      if (!hasFrame(page)) continue;
      const combinations = flagCombinations(page);
      const why = posterReason(demo, page, combinations.length);
      if (why) plan.posters.push({ route: page.frame.route, why });
      else plan.live.push({ route: page.frame.route, dir: page.frame.kind === "terminal" ? "" : `${demo.folder}/${page.beat}`, documents: combinations.map((flags) => ({ flags, file: flagFile(flags) })) });
    }
  }
  return plan;
}

/**
 * A frame document for a static host. The response header becomes a `<meta>` policy, first in the
 * head so it covers every link. `frame-ancestors`, `report-uri` and `sandbox` are ignored in a
 * `<meta>`, and browsers log a console error for them, so they go. The noindex header goes the same
 * way.
 */
export function staticFrame(html: string, csp: string): string {
  const policy = csp.split(";").map((d) => d.trim()).filter((d) => d && !/^(frame-ancestors|report-uri|report-to|sandbox)\b/.test(d)).join("; ");
  const tags = ['<meta charset="utf-8">', `<meta http-equiv="Content-Security-Policy" content="${policy.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">`, '<meta name="robots" content="noindex, nofollow">'];
  return html.replace("<head>", `<head>\n${tags.join("\n")}`);
}

/** Addresses a document or stylesheet refers to on its own origin, under /demos/. */
export function frameRefs(text: string, documentPath: string): string[] {
  const refs = [...text.matchAll(/\b(?:src|href)="([^"#]+)"|url\(["']?([^"')#]+)["']?\)/g)].map((m) => m[1] ?? m[2]);
  const out = new Set<string>();
  for (const ref of refs) {
    if (/^(data:|https?:|mailto:|\/\/)/.test(ref)) continue;
    const { pathname } = new URL(ref, `http://frame.invalid${documentPath}`);
    if (pathname.startsWith("/demos/")) out.add(pathname);
  }
  return [...out];
}
