// How a build is hosted, decided once when next.config.ts loads. Plain CommonJS for the same reason
// as with-deck.cjs. Everything here is pure, over an `env` object, so the tests can drive it.

const IMMUTABLE = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
const HOUR = [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }];
const CROSS_ORIGIN_ASSETS = [
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
];
/** A deck's public files that keep their names across deploys. */
const UNVERSIONED = ["intro", "posters", "images", "people", "logos", "demo-assets", "fonts", "backgrounds"];

const NO_INDEX = { key: "X-Robots-Tag", value: "noindex, nofollow" };
/** The runtime and the shown code expect this on every frame response, whichever host serves it. */
const FRAME_HEADERS = [{ key: "Referrer-Policy", value: "no-referrer" }, NO_INDEX];

/**
 * What the engine knows about a host. `env` names the variable the provider sets at build, which is
 * how a plain `next build` there counts as deployed. `sha` is its commit. Only Vercel has a full
 * preset so far: the rest are detection and a build ID, and need `hosts.site`.
 */
const PROVIDERS = {
  vercel: {
    env: "VERCEL",
    sha: "VERCEL_GIT_COMMIT_SHA",
    site: (env) => (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined),
    preview: (env) => env.VERCEL_ENV === "preview",
    // Read only by Vercel's CDN. Under `next start` it would reach the browser, so nothing else sends it.
    buildFileHeaders: { "Vercel-CDN-Cache-Control": "public, max-age=31536000" },
  },
  netlify: { env: "NETLIFY", sha: "COMMIT_REF" },
  cloudflare: { env: "CF_PAGES", sha: "CF_PAGES_COMMIT_SHA" },
  render: { env: "RENDER", sha: "RENDER_GIT_COMMIT" },
  railway: { env: "RAILWAY_ENVIRONMENT_NAME", sha: "RAILWAY_GIT_COMMIT_SHA" },
};

function detectProvider(env) {
  return Object.keys(PROVIDERS).find((name) => env[PROVIDERS[name].env]);
}

/**
 * Local or deployed. `live-ish build` and `live-ish present` say so through LIVE_ISH_TARGET. Without
 * the CLI, `next dev` is local, and `next build` is deployed only where a provider's variable says
 * it runs on that provider. A plain `next build` on a laptop stays local, as it always was.
 */
function resolveTarget(env) {
  if (env.LIVE_ISH_TARGET === "deployed" || env.LIVE_ISH_TARGET === "local") return env.LIVE_ISH_TARGET;
  if (env.NODE_ENV !== "production") return "local";
  return detectProvider(env) ? "deployed" : "local";
}

/** The origin of a configured address, so "https://a.dev/" and "https://a.dev" compare equal. */
function originOf(value, label) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`live-ish: ${label} must be an origin such as https://talk.example.com, found "${value}".`);
  }
}

/**
 * The three modes. The environment overrides always count, so a one-origin build can be made and
 * walked on a laptop. `hosts.frames` in the config only counts on a deployed build: `live-ish
 * present` must work with the network off, whatever the deck deploys to.
 *
 *   two-hosts  frames on their own origin, named at build
 *   one-host   frames on the page's own origin, relative, whatever that origin is
 *   local      the pair of local addresses, read from the request
 */
function resolveHosting({ env, hosts, target, provider }) {
  const deployed = target === "deployed";
  const presetSite = deployed ? PROVIDERS[provider]?.site?.(env) : undefined;
  const site = originOf(env.LIVE_ISH_SITE_ORIGIN || hosts.site || presetSite, "hosts.site");
  const frames = originOf(env.LIVE_ISH_FRAMES_ORIGIN || (deployed ? hosts.frames : undefined), "hosts.frames");
  if (frames && frames !== site) return { mode: "two-hosts", site, frames };
  return { mode: frames || deployed ? "one-host" : "local", site, frames: "" };
}

/**
 * `hosts.external` as origins. A deployed build leaves out an app on this machine: the frame would
 * ask a visitor's own laptop, so that page shows its poster instead.
 */
function externalOrigins({ hosts, target }) {
  const out = {};
  for (const [app, value] of Object.entries(hosts.external ?? {})) {
    const origin = originOf(value, `hosts.external.${app}`);
    if (target !== "deployed" || !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) out[app] = origin;
  }
  return out;
}

/** Fails a build that would point every canonical URL nowhere, in words and before any bundling. */
function assertHosting({ target, mode, site }) {
  if (target === "deployed" && !site) throw new Error("live-ish: a deployed build needs hosts.site, for its canonical URLs. Set it in deck.config.ts, or set LIVE_ISH_SITE_ORIGIN.");
  if (mode === "two-hosts" && !site) throw new Error("live-ish: hosts.frames needs hosts.site, so frames know which origin may embed them. Set it in deck.config.ts, or set LIVE_ISH_SITE_ORIGIN.");
}

/** LIVE_ISH_BUILD_ID, then the provider's commit, then `dev`. */
function resolveBuildId(env, provider) {
  if (env.LIVE_ISH_BUILD_ID) return env.LIVE_ISH_BUILD_ID;
  const named = PROVIDERS[provider]?.sha;
  const sha = (named && env[named]) || Object.values(PROVIDERS).map((p) => env[p.sha]).find(Boolean) || env.GITHUB_SHA;
  return sha ? sha.slice(0, 7) : "dev";
}

/** A declared address as a Next source: a string is exact, and a RegExp loses its capturing groups. */
function addressSource(a) {
  const pattern = a.regex ? a.regex.replace(/^\^(\\?\/)?/, "").replace(/\$$/, "").replace(/\(\?<[A-Za-z_]\w*>/g, "(?:").replace(/\((?!\?)/g, "(?:") : a.path.replace(/^\//, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `/:address(${pattern})`;
}

/**
 * Files that keep their names get an hour, then may be used stale for a day while the browser
 * rechecks. Versioned files are immutable for a year. For one path the last rule that sets a header
 * wins, so the immutable rules come after the hour-long ones.
 */
function cacheRules() {
  return [
    ...[...UNVERSIONED, "live-ish"].map((dir) => ({ source: `/${dir}/:path*`, headers: HOUR })),
    { source: "/opt/:path*", headers: [...IMMUTABLE, ...CROSS_ORIGIN_ASSETS] },
    { source: "/live-ish/:path*", has: [{ type: "query", key: "v" }], headers: IMMUTABLE },
    { source: "/fonts/:path*", headers: CROSS_ORIGIN_ASSETS },
    { source: "/demo-assets/:path*", headers: CROSS_ORIGIN_ASSETS },
  ];
}

/**
 * Every response header `next.config` owns. Next applies these over what a route handler sends, so
 * the general referrer policy has to come first and frames have to name their own after it. By
 * path, because on one host a frame and a reader page share a hostname. A separate frames host also
 * gets the header on everything it serves. Next matches `has` hosts without the port, so two origins
 * on one hostname leave that rule out.
 */
function headerRules({ production, mode, site, frames, addresses }) {
  const hostname = (origin) => new URL(origin).hostname;
  const framesHost = mode === "local" ? "127.0.0.1" : mode === "two-hosts" && (!site || hostname(site) !== hostname(frames)) ? hostname(frames) : null;
  return [
    ...(production ? cacheRules() : []),
    {
      source: "/:path*",
      headers: [
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    },
    { source: "/demos/:path*", headers: FRAME_HEADERS },
    ...addresses.map((a) => ({ source: addressSource(a), headers: FRAME_HEADERS })),
    { source: "/live-ish/:path*", headers: [NO_INDEX] },
    ...(framesHost ? [{ source: "/:path*", has: [{ type: "host", value: framesHost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }], headers: [NO_INDEX] }] : []),
  ];
}

module.exports = { PROVIDERS, addressSource, assertHosting, detectProvider, externalOrigins, headerRules, resolveBuildId, resolveHosting, resolveTarget };
