import type { BrowserContext, Frame, Page } from "@playwright/test";
import type { Checks } from "./report";

/**
 * Scripts installed before any page script, and their readers. Evaluated code is passed as strings
 * throughout this package, so tsx does not wrap helpers in its __name() calls inside the page.
 */

/** Records every engine message the presenter receives: anything that is not protocol v2 with four radii, and every runtime error. */
export const PROTOCOL_WATCH = `(() => {
  window.__protocol = { messages: 0, bad: [], errors: [] };
  addEventListener("message", (e) => {
    const d = e.data;
    if (!d || typeof d !== "object" || typeof d.type !== "string" || !("frameId" in d)) return;
    window.__protocol.messages++;
    if (d.v !== 2) window.__protocol.bad.push(d.type + " v" + d.v);
    if (d.type === "error") window.__protocol.errors.push({ code: d.code, message: d.message, selector: d.selector, action: d.action });
    if (d.type === "rects") {
      const all = [...Object.values(d.rects || {}).flat(), ...(d.focus ? [d.focus] : [])];
      for (const r of all) {
        if (!Array.isArray(r.radii) || r.radii.length !== 4 || !r.radii.every((n) => Number.isFinite(n))) { window.__protocol.bad.push("rects without four finite radii"); break; }
      }
      if (typeof d.animating !== "boolean") window.__protocol.bad.push("rects without animating");
    }
  }, true);
})()`;

/** Counts the document's view transitions. */
export const VT_WATCH = `(() => {
  window.__vtCount = 0;
  const start = Document.prototype.startViewTransition;
  if (typeof start !== "function") return;
  Document.prototype.startViewTransition = function (...args) {
    window.__vtCount++;
    return start.apply(this, args);
  };
})()`;

/**
 * Frame side, in every document: whether it was revealed with a cross-document view transition, and
 * whether the engine has them. Firefox falls back to a plain load.
 */
export const REVEAL_WATCH = `(() => {
  const supported = typeof PageRevealEvent !== "undefined" && "viewTransition" in PageRevealEvent.prototype;
  window.__walkReveal = { supported, vt: "none" };
  addEventListener("pagereveal", (e) => {
    const vt = e.viewTransition;
    if (!vt) return;
    window.__walkReveal.vt = "running";
    vt.ready.catch(() => {});
    vt.finished.then(() => (window.__walkReveal.vt = "finished"), () => (window.__walkReveal.vt = "skipped"));
  });
})()`;

export async function installWatches(context: BrowserContext) {
  await context.addInitScript(PROTOCOL_WATCH);
  await context.addInitScript(REVEAL_WATCH);
  await context.addInitScript(VT_WATCH);
}

interface ProtocolState {
  messages: number;
  bad: string[];
  errors: { code: string; message: string; selector?: string; action?: number }[];
}

export async function checkProtocol(page: Page, where: string, report: Checks) {
  const p = (await page.evaluate(`window.__protocol || null`)) as ProtocolState | null;
  if (!p) return report.fail(where, "protocol watch not installed");
  if (p.bad.length) report.fail(where, `protocol: ${p.bad.length} bad message(s), e.g. ${[...new Set(p.bad)].slice(0, 3).join("; ")}`);
  else report.pass(`protocol: ${p.messages} engine message(s), all v2, every rect with four finite radii`);
}

/** Runtime errors since the last read: a selector that matched nothing, a missing hook, a thrown step. */
export async function takeErrors(page: Page): Promise<ProtocolState["errors"]> {
  return ((await page.evaluate(`(() => { const p = window.__protocol; if (!p) return []; const e = p.errors; p.errors = []; return e; })()`).catch(() => [])) as ProtocolState["errors"]) ?? [];
}

// --------------------------------------------------------------- step results

export interface StepResult {
  asserts: { stepId: string; index: number; target: string; expect: string; pass: boolean; actual: string; skipped?: boolean }[];
  digest: string;
  ms: number;
  finished: boolean;
  seq: number;
}

export async function results(page: Page): Promise<Record<string, StepResult>> {
  return (await page.evaluate(`window.__stepResults ?? {}`).catch(() => ({}))) as Record<string, StepResult>;
}

/** Waits for a result newer than `afterSeq` under `key`. */
export async function waitForResult(page: Page, key: string, afterSeq: number, timeout = 8000): Promise<StepResult | null> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const r = (await results(page))[key];
    if (r && r.seq > afterSeq) return r;
    await page.waitForTimeout(40);
  }
  return null;
}

export async function lastSeq(page: Page): Promise<number> {
  return (await page.evaluate(`window.__stepSeq ?? 0`).catch(() => 0)) as number;
}

/** The frame the audience sees. A replay swaps iframes, so it is found again each time. */
export async function visibleFrame(page: Page): Promise<Frame | null> {
  const el = await page.$('.page-frame__iframe[data-visible="true"]');
  return (await el?.contentFrame()) ?? null;
}

export const FRAME_VISIBLE = '.page-frame__iframe[data-visible="true"]';

/** Names the focused element, class names and all, for messages and for checks that read them. */
export const describeActive = `(() => { const a = document.activeElement; if (!a) return "none"; if (a === document.body) return "body"; return a.tagName.toLowerCase() + (a.id ? "#" + a.id : "") + (a.dataset && a.dataset.control ? "[" + a.dataset.control + "]" : "") + (typeof a.className === "string" && a.className ? "." + a.className.trim().split(/\\s+/).join(".") : ""); })()`;
