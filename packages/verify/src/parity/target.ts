import type { Browser, BrowserContext, Page } from "playwright";
import type { Manifest, ManifestPage } from "@live-ish/engine/export";
import type { Facts } from "./report";

/** The classes the suites read. A manifest's `selectors` map covers a rename. */
export const DEFAULT_SELECTORS = {
  stage: ".stage",
  audience: ".audience",
  grain: ".stage__grain",
  frame: ".page-frame__iframe",
  step: ".notes__step",
  play: ".notes__play",
  controls: ".speaker__controls",
  timer: ".speaker__timer",
  notes: ".speaker__notes",
  references: ".notes__reference",
  flagBlank: '.speaker__flag[data-flag="blank"]',
  preview: ".speaker__current",
  goto: "dialog.goto",
  gotoInput: ".goto__input",
  rehearsal: ".stage__rehearsal",
  notFound: ".not-found",
  stepSegment: ".page__steps-seg",
};

export interface Target {
  origin: string;
  framesOrigin: string;
  manifest: Manifest;
  selectors: typeof DEFAULT_SELECTORS;
  browser: Browser;
  /** Stored as the row's digest. Holds what this target shows, so it never crosses targets. */
  evidence(value: unknown): void;
}

export interface Fetched {
  status: number;
  headers: Headers;
  text: string;
}

/** A row's check. `null` means the target has nothing to check here. */
export type Check = (t: Target) => Promise<Facts | null>;

/** Frames run on the other local address, or on their own host when `--frames-origin` says so. */
export function framesOriginOf(origin: string): string {
  const url = new URL(origin);
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  else if (url.hostname === "127.0.0.1") url.hostname = "localhost";
  return url.origin;
}

export async function get(origin: string, path: string, headers: Record<string, string> = {}): Promise<Fetched> {
  const res = await fetch(`${origin}${path}`, { redirect: "manual", headers });
  return { status: res.status, headers: res.headers, text: await res.text() };
}

export const framedPages = (m: Manifest): ManifestPage[] => m.pages.filter((p) => p.frame && p.frame.kind !== "server" && p.frame.route.startsWith(`${m.routes.frames}/`));

/** A page to drive: a live frame with at least two steps. */
export const walkPage = (m: Manifest): ManifestPage | undefined => framedPages(m).find((p) => p.steps.length >= 2);

export const titleOf = (html: string) => /<title[^>]*>([^<]*)<\/title>/.exec(html)?.[1] ?? "";

export function metaOf(html: string, key: string): string {
  const tag = html.match(new RegExp(`<meta[^>]+(?:name|property)="${key}"[^>]*>`))?.[0] ?? "";
  return /content="([^"]*)"/.exec(tag)?.[1] ?? "";
}

/** Runs `use` in a browser context of its own, so no row sees another's stored state. */
export async function inContext<T>(t: Target, use: (context: BrowserContext) => Promise<T>): Promise<T> {
  const context = await t.browser.newContext({ viewport: { width: 1920, height: 1080 } });
  context.setDefaultTimeout(10_000);
  try {
    return await use(context);
  } finally {
    await context.close();
  }
}

/** Opens a path and gives the page time to hydrate, so its first key press lands. */
export async function open(context: BrowserContext, t: Target, path: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${t.origin}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(500);
  return page;
}

/** True once `test` holds, false when `ms` runs out. Checks ask, so a miss is a fact, not a throw. */
export async function eventually(test: () => Promise<boolean>, ms = 5000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await test().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

export const slideOf = (page: Page) => new URL(page.url()).searchParams.get("s");
