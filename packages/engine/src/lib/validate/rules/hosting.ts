import type { Finding, Rule, RuleContext } from "../types";

/** The one line a deck that publishes its presenter gets. Printed as written, by `check` and `build`. */
export const PUBLIC_NOTES_LINE = "Your speaker notes are public at /speaker.";

const docs = (rule: string) => `https://live-ish.vercel.app/errors/${rule}`;
const STORAGE_CLEAR = /\b(?:localStorage|sessionStorage)\s*\.\s*clear\s*\(/;
const REMOTE_SCRIPT = /<script\b[^>]*\bsrc=["'](?:https?:)?\/\//i;

/** Frames share the presenter's origin on one host, so `hosts.frames` turns these two off. */
const oneOrigin = ({ deck }: RuleContext) => !deck.deck.hosts.frames;

function shownFiles({ deck }: RuleContext): { where: string; source: string }[] {
  return deck.demos.flatMap((demo) => demo.pages.flatMap((page) => ("files" in page ? page.files.map((f) => ({ where: `${demo.folder}: ${page.beat}, ${f.file}`, source: f.source })) : [])));
}

export const rules: Rule[] = [
  {
    id: "presenter-public",
    tier: "fit",
    summary: "The deck serves its presenter, and so its notes, from a deployed host.",
    run: ({ deck }) => (deck.deck.presenter.onHost ? [{ rule: "presenter-public", severity: "warning", where: "deck.config.ts: presenter.onHost", message: PUBLIC_NOTES_LINE, docs: docs("presenter-public") }] : []),
  },
  {
    id: "storage-clear",
    tier: "fit",
    summary: "Shown code clears storage that a frame shares with the presenter on one host.",
    run(ctx) {
      if (!oneOrigin(ctx)) return [];
      return shownFiles(ctx).flatMap(({ where, source }): Finding[] =>
        STORAGE_CLEAR.test(source) ? [{ rule: "storage-clear", severity: "warning", where, message: "A frame on the presenter's origin clears the presenter's storage too. The presenter recovers, but a rehearsal log kept only in this tab's memory is all that is left.", fix: "Remove the demo's own keys one by one, or set hosts.frames.", docs: docs("storage-clear") }] : [],
      );
    },
  },
  {
    id: "third-party-script",
    tier: "fit",
    summary: "Shown code loads a script from another host, which on one host can reach the presenter.",
    run(ctx) {
      if (!oneOrigin(ctx)) return [];
      return shownFiles(ctx).flatMap(({ where, source }): Finding[] =>
        REMOTE_SCRIPT.test(source) ? [{ rule: "third-party-script", severity: "warning", where, message: "A frame on the presenter's origin can read the presenter's page, so this script can too.", fix: "Serve the script from the demo folder, or set hosts.frames to give the frame its own origin.", docs: docs("third-party-script") }] : [],
      );
    },
  },
];
