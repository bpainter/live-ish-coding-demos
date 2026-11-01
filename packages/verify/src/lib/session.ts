import { chromium, firefox, webkit, type Browser, type BrowserContext, type BrowserContextOptions, type CDPSession, type Page } from "@playwright/test";
import { EnvironmentError, UsageError, type Parsed } from "./args";
import type { DeckData } from "./deck";
import type { Report } from "./report";

export type BrowserName = "chromium" | "webkit" | "firefox";

/** CDP network conditions. `venue` is a hotel or venue Wi-Fi guess, `poor` a bad day on it. */
export const PROFILES = {
  none: null,
  venue: { offline: false, latency: 60, downloadThroughput: (20 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 },
  poor: { offline: false, latency: 150, downloadThroughput: (5 * 1024 * 1024) / 8, uploadThroughput: (1 * 1024 * 1024) / 8 },
} as const;
export type ProfileName = keyof typeof PROFILES;

/** Options every browser command takes. */
export const BROWSER_VALUES = ["browser", "channel", "origin", "chrome", "without"];
export const BROWSER_FLAGS = ["headed", "json", "local-only"];

export interface SessionOptions {
  browser: BrowserName;
  channel?: string;
  headed: boolean;
  origin: string;
  /** `?chrome=<id>` on every window, so a whole run goes through one audience theme. */
  chrome?: string;
  /** Chromium switches to leave out. */
  without: string[];
  localOnly: boolean;
  /** Network conditions need one process to apply to every frame. */
  isolationOff?: boolean;
  /** Test only: runs on every context the walk opens, to prove a check can fail. */
  sabotage?: (context: BrowserContext) => Promise<void>;
}

export function sessionOptions(args: Parsed): SessionOptions {
  const browser = (args.opt("browser") ?? "chromium") as BrowserName;
  if (!["chromium", "webkit", "firefox"].includes(browser)) throw new UsageError(`--browser must be chromium, webkit or firefox, found "${browser}".`);
  const origin = (args.opt("origin") ?? process.env.LIVE_ISH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  try {
    new URL(origin);
  } catch {
    throw new UsageError(`--origin must be a URL, found "${origin}".`);
  }
  return { browser, channel: args.opt("channel"), headed: args.flag("headed"), origin, chrome: args.opt("chrome"), without: args.all("without"), localOnly: args.flag("local-only") };
}

/** Two windows in one context share BroadcastChannel, and neither may be throttled as a background tab. */
const BACKGROUND = ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"];
/** One process for every frame, so one CDP session sees cross-origin frames and throttles them too. */
const NO_ISOLATION = ["--disable-site-isolation-trials", "--disable-features=IsolateOrigins,site-per-process"];

/** The Chromium switches of a run: the deck's `verify.chromiumArgs` less any `--without`. */
export function chromiumArgs(configured: string[], without: string[], isolationOff = false): string[] {
  return [...BACKGROUND, ...(isolationOff ? NO_ISOLATION : []), ...configured.filter((a) => !without.includes(a))];
}

/** The two origins a local build answers on. */
export function originPair(origin: string): string[] {
  const u = new URL(origin);
  const pair = u.hostname === "localhost" ? "127.0.0.1" : u.hostname === "127.0.0.1" ? "localhost" : null;
  return pair ? [u.origin, `${u.protocol}//${pair}${u.port ? `:${u.port}` : ""}`] : [u.origin];
}

/** Where frames come from when a window sits at `origin`. */
export function framesOriginFor(origin: string, framesHost?: string): string {
  if (framesHost) return framesHost.replace(/\/$/, "");
  return originPair(origin).at(-1)!;
}

export interface Health {
  ok: boolean;
  build: string;
  slides: number;
  pages: number;
  server?: "production" | "development";
}

/** A run against one deck in one browser: the windows, the addresses and the guard on the network. */
export class Session {
  browser!: Browser;
  health!: Health;
  /** What `--local-only` caught. */
  readonly external: string[] = [];
  readonly frames: string;

  constructor(
    readonly deck: DeckData,
    readonly options: SessionOptions,
    readonly report: Report,
  ) {
    this.frames = framesOriginFor(options.origin, deck.deck.hosts.frames);
  }

  get origin() {
    return this.options.origin;
  }
  get browserName() {
    return this.options.browser;
  }
  /** `next dev`: the budgets in section 22 do not apply. */
  get onDevServer() {
    return this.health.server === "development";
  }

  /** Answers `/_health`, or says plainly that nothing is listening. */
  async checkServer(): Promise<void> {
    const res = await fetch(`${this.origin}/_health`).catch(() => null);
    if (!res?.ok) throw new EnvironmentError(`No deck at ${this.origin}. Run next start or next dev, or pass --origin=<url>.`);
    this.health = (await res.json()) as Health;
  }

  async start(): Promise<this> {
    await this.checkServer();
    const launcher = { chromium, webkit, firefox }[this.options.browser];
    const config = this.deck.input.config.verify ?? {};
    const channel = this.options.channel ?? config.channel;
    const args = this.options.browser === "chromium" ? { args: chromiumArgs(config.chromiumArgs ?? [], this.options.without, this.options.isolationOff), ...(channel ? { channel } : {}) } : {};
    try {
      this.browser = await launcher.launch({ headless: !this.options.headed, ...args });
    } catch (e) {
      const first = (e as Error).message.split("\n")[0];
      throw new EnvironmentError(`Could not start ${this.options.browser}: ${first}. Run playwright install ${this.options.browser}.`);
    }
    return this;
  }

  async stop() {
    await this.browser?.close();
  }

  /** A browser context with the run's guards on it. */
  async context(options: BrowserContextOptions = {}): Promise<BrowserContext> {
    const ctx = await this.browser.newContext({ viewport: { width: 1600, height: 900 }, ...options });
    if (this.options.localOnly) {
      const allowed = new Set([...originPair(this.origin), this.frames]);
      ctx.on("request", (r) => {
        const url = r.url();
        if (/^(data|blob|about):/.test(url)) return;
        const origin = new URL(url).origin;
        if (!allowed.has(origin) && !this.external.includes(url)) this.external.push(url);
      });
    }
    await this.options.sabotage?.(ctx);
    return ctx;
  }

  /** A query with the run's theme on it. */
  private query(params: Record<string, string | number | undefined>): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
    if (this.options.chrome) q.set("chrome", this.options.chrome);
    const s = q.toString();
    return s ? `?${s}` : "";
  }

  /** The audience window on a slide. */
  present(id: string, step?: number | "last", extra: Record<string, string> = {}): string {
    return `${this.origin}/present${this.query({ s: id, step: step || undefined, ...extra })}`;
  }
  speaker(id?: string): string {
    return `${this.origin}/speaker${this.query({ s: id })}`;
  }
  reader(id: string, step?: number | "last"): string {
    return `${this.origin}/s/${id}${this.query({ step: step || undefined })}`;
  }
}

/** Applies a network profile to a page's session. */
export async function applyProfile(page: Page, name: ProfileName): Promise<CDPSession | null> {
  const p = PROFILES[name];
  if (!p) return null;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", p);
  return cdp;
}

export function profileOf(value: string | undefined, fallback: ProfileName = "none"): ProfileName {
  const p = (value ?? fallback) as ProfileName;
  if (!(p in PROFILES)) throw new UsageError(`Unknown --profile=${p}. Use none, venue or poor.`);
  return p;
}

/** Runs `body` with a started session, and closes the browser whatever it does. */
export async function withSession<T>(deck: DeckData, options: SessionOptions, report: Report, body: (s: Session) => Promise<T>): Promise<T> {
  const session = await new Session(deck, options, report).start();
  try {
    return await body(session);
  } finally {
    await session.stop();
  }
}
