import type { Action, FramePage, Step } from "../../schema/demo";
import { PACE } from "../../schema/demo";

/** Flags whose toggle reloads the document. */
export const RELOADING_FLAGS = new Set(["enhance-js", "csp-enforce"]);

export function isReloadingToggle(a: Action): boolean {
  return a.type === "toggle" && RELOADING_FLAGS.has(a.flag);
}

/** Flags in effect after `steps[0..stepIndex]` (toggles accumulate through the page). */
export function flagsAt(page: FramePage, stepIndex: number): Record<string, boolean> {
  const flags = { ...(page.frame?.flags ?? {}) };
  for (let i = 0; i <= stepIndex && i < page.steps.length; i++) {
    for (const a of page.steps[i].actions) if (a.type === "toggle") flags[a.flag] = a.on;
  }
  return flags;
}

/** Flags before the step's own actions run (the document a step starts in). */
export function flagsBefore(page: FramePage, stepIndex: number): Record<string, boolean> {
  return flagsAt(page, stepIndex - 1);
}

/** Selectors the overlay and runtime watch during a step. */
export function selectorsFor(step: Step | undefined): string[] {
  if (!step) return [];
  const out = new Set<string>();
  for (const s of step.spotlight ?? []) out.add(s);
  for (const c of step.callouts ?? []) out.add(c.target);
  for (const a of step.actions) {
    if ("target" in a && typeof a.target === "string" && a.target !== ":viewport") out.add(a.target);
    if (a.type === "pointer") out.add(a.to);
  }
  return [...out];
}

/**
 * Splits a step's actions at reloading toggles: each segment after the first starts in a fresh
 * document mounted with the flags accumulated so far.
 */
export function segments(step: Step, startFlags: Record<string, boolean>): { actions: Action[]; flags: Record<string, boolean>; startAt: number; reload: boolean }[] {
  const out: { actions: Action[]; flags: Record<string, boolean>; startAt: number; reload: boolean }[] = [];
  let flags = { ...startFlags };
  let current: Action[] = [];
  let startAt = 0;
  step.actions.forEach((a, i) => {
    if (a.type === "toggle" && RELOADING_FLAGS.has(a.flag)) {
      out.push({ actions: current, flags: { ...flags }, startAt, reload: out.length > 0 });
      flags = { ...flags, [a.flag]: a.on };
      current = [];
      startAt = i + 1;
      return;
    }
    if (a.type === "toggle") flags[a.flag] = a.on;
    current.push(a);
  });
  out.push({ actions: current, flags: { ...flags }, startAt, reload: out.length > 0 });
  return out;
}

/**
 * Steps to replay into a document mounted with `flagsAt(page, stepIndex)`: everything after the
 * last reloading toggle at or before the step (actions before it ran in a document that was
 * discarded, as in forward play), minus the toggles themselves (the flags are already applied).
 */
export function replaySteps(page: FramePage, stepIndex: number): Step[] {
  const routed = routedReplay(page, stepIndex);
  if (routed) return routed;
  let fromStep = 0;
  let fromAction = 0;
  for (let i = 0; i <= stepIndex && i < page.steps.length; i++) {
    page.steps[i].actions.forEach((a, j) => {
      if (isReloadingToggle(a)) {
        fromStep = i;
        fromAction = j + 1;
      }
    });
  }
  return page.steps.slice(0, stepIndex + 1).map((s, i) => ({
    ...s,
    actions: i < fromStep ? [] : s.actions.filter((a, j) => (i > fromStep || j >= fromAction) && !isReloadingToggle(a)),
  }));
}

/** Nominal duration of a step's animated playback in ms. */
export function nominalMs(step: Step): number {
  let ms = 0;
  let cursorPlaced = false;
  for (const a of step.actions) {
    switch (a.type) {
      case "pointer":
        ms += PACE.glideMs;
        cursorPlaced = true;
        break;
      case "click":
        ms += (cursorPlaced ? 0 : PACE.glideMs) + PACE.rippleMs;
        cursorPlaced = false;
        break;
      case "key":
        ms += PACE.keyLeadMs;
        break;
      case "type":
        ms += a.text.length * PACE.charMs;
        break;
      case "paste":
        ms += PACE.pasteMs;
        break;
      case "resize":
        ms += PACE.resizeMs;
        break;
      case "reveal":
        ms += PACE.revealMs;
        break;
      case "toggle":
        ms += RELOADING_FLAGS.has(a.flag) ? PACE.reloadMs : 0;
        break;
      case "navigate":
        ms += PACE.navigateBudgetMs;
        break;
      case "hook":
        ms += PACE.hookBudgetMs;
        break;
      case "wait":
        ms += a.ms;
        break;
      default:
        break;
    }
  }
  return ms;
}

export function ceilingMs(step: Step): number {
  return step.actions.some((a) => a.type === "type" || a.type === "paste" || a.type === "terminal") ? 6000 : 2500;
}

/** The document a step ends on in a multi-page build: its own route or the last one before it. */
export function routeAt(page: FramePage, stepIndex: number): string | undefined {
  for (let i = Math.min(stepIndex, page.steps.length - 1); i >= 0; i--) if (page.steps[i].route) return page.steps[i].route;
  return undefined;
}

/**
 * Instant replay on a multi-page build. The fresh document is the
 * build's entry page (s0's route). The last routed step at or before `stepIndex` defines the
 * state: steps before it replay nothing; it opens its route with one navigation when that differs
 * from the entry page (a real entry, so a later Back has somewhere to go; the runtime skips the
 * view transition in instant runs), then runs its actions after its last click or navigate, the
 * waits and asserts that end it. Steps after it, still in that document, replay as usual.
 * Null when the page has no routes, or walks its own history: that replays every action, so each
 * entry exists when a later step goes back or forward over it.
 */
function routedReplay(page: FramePage, stepIndex: number): Step[] | null {
  let k = -1;
  for (let i = 0; i <= stepIndex && i < page.steps.length; i++) if (page.steps[i].route) k = i;
  if (k < 0) return null;
  // Back and Forward need the entries a forward run made, and a route alone opens none of them.
  if (page.steps.some((s) => s.actions.some((a) => a.type === "navigate" && a.history))) return null;
  const entry = page.steps[0].route ?? "index.html";
  return page.steps.slice(0, stepIndex + 1).map((s, i) => {
    if (i < k) return { ...s, actions: [] };
    if (i > k) return { ...s, actions: s.actions.filter((a) => !isReloadingToggle(a)) };
    let last = -1;
    s.actions.forEach((a, j) => {
      if (a.type === "click" || a.type === "navigate") last = j;
    });
    const rest = s.actions.slice(last + 1).filter((a) => a.type !== "pointer" && !isReloadingToggle(a));
    const open: Action[] = s.route !== entry ? [{ type: "navigate", url: s.route }] : [];
    return { ...s, actions: [...open, ...rest] };
  });
}
