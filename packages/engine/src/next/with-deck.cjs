// Plain CommonJS on purpose: Next loads next.config.ts before any bundler runs, and neither its
// require hook nor Node's type stripping will transform TypeScript inside node_modules.
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

const ENGINE = path.join(__dirname, "..", "..");
const IMMUTABLE = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
const HOUR = [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }];

/** Runs `prepareDeck` to completion in a child process. A config file has to load synchronously. */
function prepare(root) {
  // Next loads the config in several processes, and they inherit this.
  if (process.env.LIVE_ISH_PREPARED === root) return;
  const tsx = require.resolve("tsx");
  const main = path.join(ENGINE, "src", "prepare", "main.ts");
  execFileSync(process.execPath, ["--conditions=react-server", "--import", require("node:url").pathToFileURL(tsx).href, main, root], { stdio: "inherit", cwd: root });
  process.env.LIVE_ISH_PREPARED = root;
}

function buildId() {
  const { LIVE_ISH_BUILD_ID, VERCEL_GIT_COMMIT_SHA, CF_PAGES_COMMIT_SHA, COMMIT_REF, GITHUB_SHA } = process.env;
  return LIVE_ISH_BUILD_ID ?? (VERCEL_GIT_COMMIT_SHA ?? CF_PAGES_COMMIT_SHA ?? COMMIT_REF ?? GITHUB_SHA)?.slice(0, 7) ?? "dev";
}

/**
 * The audience and speaker windows are prerendered per slide at /present/<id> and /speaker/<id> while
 * their addresses stay /present?s=<id> and /speaker?s=<id>. A well-formed `s` goes to its page, and
 * any other /present or /speaker to the first slide. The other parameters are read on the client.
 */
function presenterRewrites(first) {
  return ["/present", "/speaker"].flatMap((route) => [
    { source: route, has: [{ type: "query", key: "s", value: "(?<s>[a-z0-9-]+)" }], destination: `${route}/:s` },
    { source: route, destination: `${route}/${first}` },
  ]);
}

/**
 * Declared addresses go to the address route. Everything else stays with Next, so the custom 404
 * still answers. A string is exact. A RegExp's groups become non-capturing, because Next's patterns
 * refuse capturing ones; the route handler matches again with the original to read them.
 */
function addressRewrites(addresses) {
  return addresses.map((a) => {
    const pattern = a.regex ? a.regex.replace(/^\^(\\?\/)?/, "").replace(/\$$/, "").replace(/\(\?<[A-Za-z_]\w*>/g, "(?:").replace(/\((?!\?)/g, "(?:") : a.path.replace(/^\//, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return { source: `/:address(${pattern})`, destination: "/live-ish-address/:address" };
  });
}

function headers(frames) {
  const production = process.env.NODE_ENV === "production";
  const framesHost = new URL(frames ?? "http://127.0.0.1").hostname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    ...(production
      ? [
          // Unversioned engine files get an hour. Links the frame shell versions with ?v= are immutable.
          { source: "/live-ish/:path*", headers: HOUR },
          { source: "/live-ish/:path*", has: [{ type: "query", key: "v" }], headers: IMMUTABLE },
        ]
      : []),
    {
      source: "/:path*",
      headers: [
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    },
    // Every response from the frames host stays out of search indexes.
    { source: "/:path*", has: [{ type: "host", value: framesHost }], headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
  ];
}

/** The deck's whole Next config: alias, rewrites, cache headers, tracing and the build ID. */
function withDeck(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  prepare(root);
  const summary = JSON.parse(readFileSync(path.join(root, ".live-ish", "deck.json"), "utf8"));
  const site = process.env.LIVE_ISH_SITE_ORIGIN ?? summary.hosts.site ?? "";
  const frames = process.env.LIVE_ISH_FRAMES_ORIGIN ?? summary.hosts.frames ?? "";
  const generated = path.join(root, ".live-ish", "deck.gen.ts");
  if (!existsSync(generated)) throw new Error("live-ish: .live-ish/deck.gen.ts is missing after prepareDeck.");
  const { next = {} } = options;
  return {
    reactStrictMode: true,
    // No dev badge on stage or in captures.
    devIndicators: false,
    // A second build directory lets a production build run beside `next dev`.
    distDir: process.env.NEXT_DIST_DIR ?? ".next",
    images: { unoptimized: true },
    ...next,
    transpilePackages: ["@live-ish/engine", ...(next.transpilePackages ?? [])],
    env: {
      NEXT_PUBLIC_BUILD_ID: buildId(),
      NEXT_PUBLIC_LIVE_ISH_SITE_ORIGIN: site,
      NEXT_PUBLIC_LIVE_ISH_FRAMES_ORIGIN: frames,
      NEXT_PUBLIC_LIVE_ISH_EXTERNAL: JSON.stringify(summary.hosts.external ?? {}),
      ...next.env,
    },
    turbopack: { ...next.turbopack, resolveAlias: { ...next.turbopack?.resolveAlias, "@live-ish/deck": "./.live-ish/deck.gen.ts" } },
    webpack(config, context) {
      config.resolve.alias["@live-ish/deck"] = generated;
      return next.webpack ? next.webpack(config, context) : config;
    },
    // Files the server reads with fs at request time. Every read has a runtime path, which tracing
    // can't follow, so a deployment gets them from these globs.
    outputFileTracingIncludes: { ...next.outputFileTracingIncludes, "/**": ["./demos/**/*", "./.live-ish/**/*", ...(next.outputFileTracingIncludes?.["/**"] ?? [])] },
    async rewrites() {
      return { beforeFiles: [...presenterRewrites(summary.firstSlide), ...addressRewrites(summary.addresses)], afterFiles: [], fallback: [] };
    },
    async headers() {
      return [...headers(frames || undefined), ...((await next.headers?.()) ?? [])];
    },
  };
}

exports.withDeck = withDeck;
