import type { FromRuntime } from "./protocol";

/** What a `dev` overlay says about a frame that went wrong: what failed, what is known, what to do. */
export interface Fault {
  title: string;
  detail: string;
  fix: string;
}

type RuntimeError = Pick<Extract<FromRuntime, { type: "error" }>, "code" | "message" | "selector" | "ids">;

const IDS_SHOWN = 12;

/** A step that failed in the frame, named for the person who wrote it. */
export function runtimeFault(error: RuntimeError, stepId: string | undefined): Fault {
  const where = stepId ? `Step ${stepId}: ` : "";
  switch (error.code) {
    case "selector-not-found": {
      const ids = error.ids ?? [];
      const shown = ids.slice(0, IDS_SHOWN).map((id) => `#${id}`).join(", ");
      return {
        title: `${where}"${error.selector}" matches nothing`,
        detail: ids.length ? `Found: ${shown}${ids.length > IDS_SHOWN ? ` and ${ids.length - IDS_SHOWN} more` : ""}.` : "This document has no ids.",
        fix: "Fix the selector in demo.ts. If a script creates the element, add a step that waits for it first.",
      };
    }
    case "hook-missing":
      return { title: `${where}${error.message}`, detail: "The step calls a hook this document does not define.", fix: "Define it on window.demoHooks in hooks.js, or fix the name in demo.ts." };
    case "assert-failed":
      return { title: `${where}An assert failed`, detail: error.message, fix: "Fix the step's assert in demo.ts, or the page it checks." };
    case "via-unsupported":
      return { title: `${where}This key cannot be played`, detail: error.message, fix: "Run `live-ish actions` for the `via` values a key action takes." };
    case "flag-unknown":
      return { title: `${where}Unknown flag`, detail: error.message, fix: "List the flag under `flags` on this beat in demo.ts." };
    default:
      return { title: `${where}The frame failed`, detail: error.message, fix: "Check the frame's console." };
  }
}

/**
 * Why a frame stayed silent, when it can be told from here. The origins come from the caller, because
 * lib/frames/origins.ts owns what each mode allows.
 */
export function blockedFault(frame: { origin: string; allowed: string | null; app: string | null }, here: string): Fault {
  if (frame.app) {
    return {
      title: `The ${frame.app} server did not answer`,
      detail: frame.origin ? `This frame comes from ${frame.origin}.` : `hosts.external has no address for ${frame.app}.`,
      fix: `Check that the server is running, and hosts.external.${frame.app} in deck.config.ts.`,
    };
  }
  if (frame.allowed && frame.allowed !== here) {
    return {
      title: "This window's host is not allowed to embed the frame",
      detail: `Frames from ${frame.origin} allow ${frame.allowed}. This window is on ${here}.`,
      fix: "Open the deck on the allowed host, or check hosts.site and hosts.frames in deck.config.ts.",
    };
  }
  return {
    title: "The frame did not answer",
    detail: `It comes from ${frame.origin}, which allows this window.`,
    fix: "Check hosts.frames in deck.config.ts, then the server's log. Press r to reload the frame.",
  };
}
