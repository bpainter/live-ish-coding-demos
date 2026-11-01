import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { deckKey } from "../src/lib/deck-keys";
import { BASE_CSP, cspFor } from "../src/lib/frames/compose";
import { frameUrlFor, framesOriginFor, presenterOriginFor, type Hosting } from "../src/lib/frames/origins";
import { robotsTxt, type RobotsInput } from "../src/lib/frames/robots";
import type { BuildDef } from "../src/lib/frames/types";
import { PUBLIC_NOTES_LINE, rules as hostingRules } from "../src/lib/validate/rules/hosting";
import type { RuleContext } from "../src/lib/validate/types";
import { assertHosting, detectProvider, headerRules, resolveBuildId, resolveHosting, resolveTarget } from "../src/next/hosting.cjs";
import { deckId, keepsNotes } from "../src/prepare";
import { collectNotes, stripNotes, strippedDeckModule } from "../src/prepare/strip";
import { assembleDeck, type DeckInput } from "../src/schema/assemble";

const SITE = "https://talk.example.com";
const FRAMES = "https://frames.example.com";
const LOCAL: Hosting = { mode: "local", site: "", frames: "" };
const ONE_HOST: Hosting = { mode: "one-host", site: "", frames: "" };
const TWO_HOSTS: Hosting = { mode: "two-hosts", site: SITE, frames: FRAMES };
const at = (href: string) => new URL(href) as unknown as Location;

// --------------------------------------------------------------- target and mode

test("a build is deployed by the CLI, or by a provider's variable, and never by next dev", () => {
  const production = { NODE_ENV: "production" };
  assert.equal(resolveTarget({ ...production, LIVE_ISH_TARGET: "deployed" }), "deployed");
  assert.equal(resolveTarget({ ...production, LIVE_ISH_TARGET: "local", VERCEL: "1" }), "local");
  assert.equal(resolveTarget({ ...production, VERCEL: "1" }), "deployed");
  assert.equal(resolveTarget({ ...production, NETLIFY: "true" }), "deployed");
  assert.equal(resolveTarget({ NODE_ENV: "development", VERCEL: "1" }), "local");
  assert.equal(resolveTarget(production), "local");
  assert.equal(detectProvider({ CF_PAGES: "1" }), "cloudflare");
  assert.equal(detectProvider({}), undefined);
});

test("three modes, from the target and the hosts", () => {
  const mode = (target: "local" | "deployed", hosts: { site?: string; frames?: string }, env = {}) => resolveHosting({ env, hosts, target }).mode;
  assert.equal(mode("local", {}), "local");
  assert.equal(mode("deployed", { site: SITE }), "one-host");
  assert.equal(mode("deployed", { site: SITE, frames: FRAMES }), "two-hosts");
  assert.equal(mode("deployed", { site: SITE, frames: `${SITE}/` }), "one-host");
});

test("hosts.frames counts only on a deployed build, so present needs no network", () => {
  assert.deepEqual(resolveHosting({ env: {}, hosts: { site: SITE, frames: FRAMES }, target: "local" }), { mode: "local", site: SITE, frames: "" });
});

test("the environment overrides the hosts, on a laptop too, and both variables on one address are one host", () => {
  const origin = "http://localhost:3200";
  assert.deepEqual(resolveHosting({ env: { LIVE_ISH_SITE_ORIGIN: origin, LIVE_ISH_FRAMES_ORIGIN: origin }, hosts: {}, target: "local" }), { mode: "one-host", site: origin, frames: "" });
  assert.deepEqual(resolveHosting({ env: { LIVE_ISH_SITE_ORIGIN: origin, LIVE_ISH_FRAMES_ORIGIN: "http://127.0.0.1:3200" }, hosts: { site: SITE }, target: "local" }), { mode: "two-hosts", site: origin, frames: "http://127.0.0.1:3200" });
});

test("a provider preset can supply the site, only when deployed", () => {
  const env = { VERCEL_PROJECT_PRODUCTION_URL: "deck.vercel.app" };
  assert.equal(resolveHosting({ env, hosts: {}, target: "deployed", provider: "vercel" }).site, "https://deck.vercel.app");
  assert.equal(resolveHosting({ env, hosts: {}, target: "local", provider: "vercel" }).site, "");
});

test("a bad origin fails in words", () => {
  assert.throws(() => resolveHosting({ env: {}, hosts: { site: "talk.example.com" }, target: "deployed" }), /hosts\.site must be an origin/);
});

test("the production guard needs a site, and two hosts need one anywhere", () => {
  assert.throws(() => assertHosting({ target: "deployed", mode: "one-host", site: "" }), /needs hosts\.site/);
  assert.throws(() => assertHosting({ target: "local", mode: "two-hosts", site: "" }), /hosts\.frames needs hosts\.site/);
  assert.doesNotThrow(() => assertHosting({ target: "local", mode: "local", site: "" }));
  assert.doesNotThrow(() => assertHosting({ target: "deployed", mode: "one-host", site: SITE }));
});

test("the build ID is the override, then the provider's commit, then dev", () => {
  const sha = "0123456789abcdef";
  assert.equal(resolveBuildId({ LIVE_ISH_BUILD_ID: "v1", VERCEL_GIT_COMMIT_SHA: sha }, "vercel"), "v1");
  assert.equal(resolveBuildId({ VERCEL_GIT_COMMIT_SHA: sha }, "vercel"), "0123456");
  assert.equal(resolveBuildId({ COMMIT_REF: sha }), "0123456");
  assert.equal(resolveBuildId({}), "dev");
});

// --------------------------------------------------------------- origins

test("local: the pair comes from the address in use, on any port", () => {
  assert.equal(framesOriginFor(at("http://localhost:3400/speaker"), LOCAL), "http://127.0.0.1:3400");
  assert.equal(framesOriginFor(at("http://127.0.0.1:3400/speaker"), LOCAL), "http://localhost:3400");
  assert.equal(presenterOriginFor("http://127.0.0.1:3400", LOCAL), "http://localhost:3400");
  assert.equal(presenterOriginFor("http://localhost:5001", LOCAL), "http://127.0.0.1:5001");
});

test("local: an address with no pair, such as a LAN address, frames itself", () => {
  assert.equal(framesOriginFor(at("http://192.168.1.20:3000/s/title"), LOCAL), "http://192.168.1.20:3000");
  assert.equal(presenterOriginFor("http://192.168.1.20:3000", LOCAL), "http://192.168.1.20:3000");
});

test("one host: frames stay on the page's own origin, even on localhost, and their URLs are relative", () => {
  assert.equal(framesOriginFor(at("http://localhost:3200/present"), ONE_HOST), "http://localhost:3200");
  assert.equal(presenterOriginFor("http://localhost:3200", ONE_HOST), "http://localhost:3200");
  assert.deepEqual(frameUrlFor("/demos/faq/after/index.html", at("https://talk.example.com/present"), ONE_HOST), { origin: "https://talk.example.com", url: "/demos/faq/after/index.html" });
});

test("two hosts: frames come from their host, and only the site embeds them", () => {
  assert.deepEqual(frameUrlFor("/demos/faq/after/index.html", at(`${SITE}/present`), TWO_HOSTS), { origin: FRAMES, url: `${FRAMES}/demos/faq/after/index.html` });
  assert.equal(presenterOriginFor(FRAMES, TWO_HOSTS), SITE);
  assert.equal(presenterOriginFor(SITE, TWO_HOSTS), SITE);
});

// --------------------------------------------------------------- CSP

const def = { manifest: { flags: {} } } as unknown as BuildDef;
const policy = (origin: string, hosting: Hosting) => cspFor(def, origin, {}, hosting).value;

test("CSP per mode", () => {
  assert.equal(BASE_CSP.includes("frame-ancestors PRESENTER"), true);
  assert.equal(
    policy("http://127.0.0.1:3400", LOCAL),
    "default-src 'none'; script-src http://127.0.0.1:3400; style-src http://127.0.0.1:3400 'unsafe-inline'; img-src http://127.0.0.1:3400 data:; font-src http://127.0.0.1:3400; connect-src http://127.0.0.1:3400; form-action http://127.0.0.1:3400; base-uri 'none'; object-src 'none'; frame-ancestors http://localhost:3400",
  );
  assert.equal(policy("https://talk.example.com", ONE_HOST), "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'");
  assert.equal(
    policy(FRAMES, TWO_HOSTS),
    "default-src 'none'; script-src https://frames.example.com; style-src https://frames.example.com 'unsafe-inline'; img-src https://frames.example.com data:; font-src https://frames.example.com; connect-src https://frames.example.com; form-action https://frames.example.com; base-uri 'none'; object-src 'none'; frame-ancestors https://talk.example.com",
  );
});

test("a one-host policy names no host, so a rewritten host header cannot change it", () => {
  assert.equal(policy("http://internal:8080", ONE_HOST), policy("https://talk.example.com", ONE_HOST));
});

test("csp-enforce off turns the policy to report-only", () => {
  const flagged = { manifest: { flags: { "csp-enforce": true } } } as unknown as BuildDef;
  assert.equal(cspFor(flagged, FRAMES, { "csp-enforce": false }, TWO_HOSTS).header, "Content-Security-Policy-Report-Only");
  assert.equal(cspFor(flagged, FRAMES, { "csp-enforce": true }, TWO_HOSTS).header, "Content-Security-Policy");
});

// --------------------------------------------------------------- robots

const robots = (over: Partial<RobotsInput>) => robotsTxt({ mode: "one-host", host: "talk.example.com", site: "", indexable: true, presenter: false, addresses: ["/orders"], sitemap: `${SITE}/sitemap.xml`, ...over });
const CLOSED = "User-agent: *\nDisallow: /\n";

test("robots: one host, no presenter", () => {
  assert.equal(
    robots({}),
    `User-agent: *
Allow: /
Allow: /s/
Disallow: /demos/
Disallow: /live-ish/
Disallow: /_health
Disallow: /orders

Sitemap: https://talk.example.com/sitemap.xml
`,
  );
});

test("robots: one host branches on the mode, not on the host", () => {
  assert.equal(robots({ host: "preview-abc.vercel.app" }), robots({}));
  assert.equal(robots({ host: "127.0.0.1:3200" }), robots({}));
});

test("robots: the link-preview group exists only where /present does", () => {
  assert.equal(
    robots({ presenter: true }),
    `User-agent: LinkedInBot
User-agent: Twitterbot
User-agent: facebookexternalhit
User-agent: Slackbot
User-agent: Slackbot-LinkExpanding
User-agent: Discordbot
User-agent: WhatsApp
User-agent: TelegramBot
User-agent: Applebot
User-agent: redditbot
User-agent: SkypeUriPreview
Allow: /
Disallow: /demos/
Disallow: /live-ish/
Disallow: /_health
Disallow: /orders

User-agent: *
Allow: /
Allow: /s/
Disallow: /present
Disallow: /speaker
Disallow: /demos/
Disallow: /live-ish/
Disallow: /_health
Disallow: /orders

Sitemap: https://talk.example.com/sitemap.xml
`,
  );
  assert.equal(robots({}).includes("LinkedInBot"), false);
});

test("robots: two hosts close every host but the site", () => {
  const two = { mode: "two-hosts" as const, site: SITE };
  assert.equal(robots({ ...two, host: "frames.example.com" }), CLOSED);
  assert.equal(robots({ ...two, host: "preview-abc.vercel.app" }), CLOSED);
  assert.equal(robots({ ...two, host: "talk.example.com" }).includes("Allow: /s/"), true);
});

test("robots: local closes the frames address, and a deck can close itself", () => {
  assert.equal(robots({ mode: "local", host: "127.0.0.1:3000" }), CLOSED);
  assert.equal(robots({ mode: "local", host: "localhost:3000" }).includes("Allow: /s/"), true);
  assert.equal(robots({ indexable: false }), CLOSED);
});

// --------------------------------------------------------------- headers

const headersOf = (rules: ReturnType<typeof headerRules>, source: string, key: string) => rules.filter((r) => r.source === source && !r.has).flatMap((r) => r.headers).filter((h) => h.key === key).map((h) => h.value);

test("frames send no-referrer: the frame rules come after the general one, and the last rule wins", () => {
  const rules = headerRules({ production: true, mode: "one-host", site: SITE, frames: "", addresses: [{ path: "/orders" }, { regex: "^/cases/(?<id>\\d+)$" }] });
  const order = (source: string) => rules.findIndex((r) => r.source === source);
  assert.ok(order("/:path*") < order("/demos/:path*"));
  assert.deepEqual(headersOf(rules, "/demos/:path*", "Referrer-Policy"), ["no-referrer"]);
  assert.deepEqual(headersOf(rules, "/:address(orders)", "Referrer-Policy"), ["no-referrer"]);
  assert.deepEqual(headersOf(rules, "/:address(cases/(?:\\d+))", "X-Robots-Tag"), ["noindex, nofollow"]);
  assert.deepEqual(headersOf(rules, "/:path*", "Referrer-Policy"), ["strict-origin-when-cross-origin"]);
});

test("X-Robots-Tag per mode: by host only where frames have one of their own", () => {
  const hostRule = (mode: Hosting["mode"], site: string, frames: string) => headerRules({ production: false, mode, site, frames, addresses: [] }).find((r) => r.has?.[0]?.type === "host")?.has?.[0]?.value;
  assert.equal(hostRule("one-host", SITE, ""), undefined);
  assert.equal(hostRule("local", "", ""), "127\\.0\\.0\\.1");
  assert.equal(hostRule("two-hosts", SITE, FRAMES), "frames\\.example\\.com");
  assert.equal(hostRule("two-hosts", "http://localhost:3200", "http://localhost:3201"), undefined);
});

test("cache classes stay, in production only", () => {
  const rules = headerRules({ production: true, mode: "local", site: "", frames: "", addresses: [] });
  const cache = (source: string) => rules.filter((r) => r.source === source).flatMap((r) => r.headers).find((h) => h.key === "Cache-Control")?.value;
  assert.equal(cache("/opt/:path*"), "public, max-age=31536000, immutable");
  assert.equal(cache("/images/:path*"), "public, max-age=3600, stale-while-revalidate=86400");
  assert.ok(rules.some((r) => r.source === "/live-ish/:path*" && r.has?.[0]?.key === "v" && r.headers[0].value.includes("immutable")));
  assert.equal(
    headerRules({ production: false, mode: "local", site: "", frames: "", addresses: [] }).some((r) => r.source === "/opt/:path*"),
    false,
  );
});

test("a deck's own stylesheet gets the hour rule, or each frame mount rechecks it", () => {
  const input = { production: true, mode: "local" as const, site: "", frames: "", addresses: [], publicFiles: ["/styles/a.css"] };
  const rule = headerRules(input).find((r) => r.source === "/:address(styles/a\\.css)");
  assert.equal(rule?.headers[0].value, "public, max-age=3600, stale-while-revalidate=86400");
  assert.equal(headerRules({ ...input, production: false }).some((r) => r.source.includes("styles")), false);
});

// --------------------------------------------------------------- notes

const step = { id: "s0", label: "Start", actions: [], notes: ["A private step note."], ifKeyboard: "A private hint." };
const input: DeckInput = {
  config: { schemaVersion: 1, title: "Deck", order: ["one", "tabs"], speaker: { name: "A Speaker" } },
  slides: [{ id: "one", title: "One", notes: "A private slide note." }],
  demos: [
    {
      folder: "demos/tabs",
      hooks: false,
      routes: undefined,
      demo: { id: "tabs", title: "Tabs", scenario: "A public scenario.", cautions: ["A private caution."], intro: { description: "An intro.", notes: "A private intro note." }, before: { notes: "A private beat note.", steps: [step] } },
    },
  ],
};

test("a public deck module holds the data and none of the speaker's text", () => {
  const source = strippedDeckModule(input);
  assert.equal(/private/.test(source), false);
  assert.equal(source.includes("A public scenario."), true);
  assert.equal(source.includes('"label":"Start"'), true);
  assert.deepEqual(stripNotes(input).config, input.config);
});

test("a routes.ts stays an import, and code in the data stops the build", () => {
  const routed = { ...input, demos: [{ ...input.demos[0], routes: [] }] };
  assert.match(strippedDeckModule(routed), /import routes0 from "\.\.\/demos\/tabs\/routes";/);
  const coded = { ...input, slides: [{ ...input.slides[0], description: (() => "x") as unknown as string }] };
  assert.throws(() => strippedDeckModule(coded), /must be plain values/);
});

test("notes stay on local builds and where the deck publishes them", () => {
  process.env.LIVE_ISH_DECK_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "examples", "starter");
  const deck = (extra: Partial<DeckInput["config"]>) => assembleDeck({ ...input, demos: [], config: { ...input.config, order: ["one"], ...extra } });
  assert.equal(keepsNotes(deck({}), "local"), true);
  assert.equal(keepsNotes(deck({}), "deployed"), false);
  assert.equal(keepsNotes(deck({ presenter: { onHost: true } }), "deployed"), true);
  assert.equal(keepsNotes(deck({ reader: { notes: true } }), "deployed"), true);
  assert.deepEqual(collectNotes(deck({})), ["A private slide note."]);
});

// --------------------------------------------------------------- deck scope

test("storage keys and channels are scoped to the deck", () => {
  assert.equal(deckId("Show the code & the result!"), "show-the-code-the-result");
  assert.equal(deckId("---"), "deck");
  assert.equal(deckKey("state"), "live-ish:deck:state");
});

test("the runtime reads no referrer: frames send none", () => {
  const runtime = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "demo-runtime.js"), "utf8");
  assert.equal(runtime.includes("document.referrer"), false);
});

// --------------------------------------------------------------- what `check` prints

function context(config: Partial<DeckInput["config"]>, source: string): RuleContext {
  const page = { beat: "after", files: [{ file: "app.js", source }], steps: [] };
  const deck = { deck: { presenter: { onHost: false }, hosts: {}, ...config }, demos: [{ folder: "demos/tabs", pages: [page] }], slides: [] } as unknown as RuleContext["deck"];
  return { root: "/deck", deck, strict: false };
}

const findings = async (id: string, ctx: RuleContext) => await hostingRules.find((r) => r.id === id)!.run(ctx);

test("a public presenter gets its one line", async () => {
  assert.equal(PUBLIC_NOTES_LINE, "Your speaker notes are public at /speaker.");
  const [finding] = await findings("presenter-public", context({ presenter: { onHost: true } }, ""));
  assert.equal(finding.message, PUBLIC_NOTES_LINE);
  assert.deepEqual(await findings("presenter-public", context({}, "")), []);
});

test("shown code that reaches the presenter on one origin warns, and hosts.frames turns it off", async () => {
  assert.equal((await findings("storage-clear", context({}, "localStorage.clear();"))).length, 1);
  assert.equal((await findings("storage-clear", context({ hosts: { frames: FRAMES, external: {} } }, "localStorage.clear();"))).length, 0);
  assert.equal((await findings("third-party-script", context({}, '<script src="https://cdn.example.com/a.js"></script>'))).length, 1);
  assert.equal((await findings("third-party-script", context({}, '<script src="/a.js"></script>'))).length, 0);
});
