// Plain CommonJS on purpose: Next loads next.config.ts before any bundler runs, and neither its
// require hook nor Node's type stripping will transform TypeScript inside node_modules.
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");
const { PROVIDERS, addressSource, assertHosting, detectProvider, headerRules, resolveBuildId, resolveHosting, resolveTarget } = require("./hosting.cjs");

const ENGINE = path.join(__dirname, "..", "..");
/** `page.presenter.tsx` and `layout.presenter.tsx` are pages only when this is listed. */
const PRESENTER_EXTENSION = "presenter.tsx";
const NEXT_EXTENSIONS = ["tsx", "ts", "jsx", "js"];

/** Runs `prepareDeck` to completion in a child process. A config file has to load synchronously. */
function prepare(root, target) {
  // Next loads the config in several processes, and they inherit this.
  if (process.env.LIVE_ISH_PREPARED === root) return;
  const tsx = require.resolve("tsx");
  const main = path.join(ENGINE, "src", "prepare", "main.ts");
  execFileSync(process.execPath, ["--conditions=react-server", "--import", require("node:url").pathToFileURL(tsx).href, main, root, target], { stdio: "inherit", cwd: root });
  process.env.LIVE_ISH_PREPARED = root;
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
  return addresses.map((a) => ({ source: addressSource(a), destination: "/live-ish-address/:address" }));
}

/** The deck's whole Next config: alias, rewrites, cache headers, tracing and the build ID. */
function withDeck(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const env = process.env;
  const target = resolveTarget(env);
  prepare(root, target);
  const summary = JSON.parse(readFileSync(path.join(root, ".live-ish", "deck.json"), "utf8"));
  const provider = options.provider ?? detectProvider(env);
  const { mode, site, frames } = resolveHosting({ env, hosts: summary.hosts, target, provider });
  // `next start` loads this file too, and a server that is already built has nothing to guard.
  const building = process.argv.includes("build");
  if (building) assertHosting({ target, mode, site });
  const deployed = target === "deployed";
  // Local modes always have the presenter. A deployed host has it only when the deck asks.
  const presenter = !deployed || summary.presenter.onHost;
  const preview = Boolean(deployed && PROVIDERS[provider]?.preview?.(env));
  // A plain `next build` is the one path to a host the engine cannot see, so it says what it made.
  if (building && !deployed && site && !env.LIVE_ISH_TARGET) console.warn("live-ish: local build, with the presenter and speaker notes in it. Deploy with `live-ish build`.");
  const generated = path.join(root, ".live-ish", "deck.gen.ts");
  const analytics = path.join(root, ".live-ish", "analytics.gen.ts");
  if (!existsSync(generated) || !existsSync(analytics)) throw new Error("live-ish: generated files are missing from .live-ish/ after prepareDeck.");
  const { next = {} } = options;
  const aliases = { "@live-ish/deck": "./.live-ish/deck.gen.ts", "@live-ish/analytics": "./.live-ish/analytics.gen.ts" };
  return {
    reactStrictMode: true,
    // No dev badge on stage or in captures.
    devIndicators: false,
    // A second build directory lets a production build run beside `next dev`.
    distDir: process.env.NEXT_DIST_DIR ?? ".next",
    images: { unoptimized: true },
    ...next,
    // The one way to leave a page out of a build, with no route, no chunk and no payload.
    pageExtensions: [...(presenter ? [PRESENTER_EXTENSION] : []), ...(next.pageExtensions ?? NEXT_EXTENSIONS)],
    transpilePackages: ["@live-ish/engine", ...(next.transpilePackages ?? [])],
    env: {
      NEXT_PUBLIC_BUILD_ID: resolveBuildId(env, provider),
      NEXT_PUBLIC_LIVE_ISH_DECK: summary.deckId,
      NEXT_PUBLIC_LIVE_ISH_TARGET: target,
      NEXT_PUBLIC_LIVE_ISH_MODE: mode,
      // Only two hosts name an origin in client code. Local and one-host builds carry none.
      NEXT_PUBLIC_LIVE_ISH_PRESENTER_ORIGIN: mode === "two-hosts" ? site : "",
      NEXT_PUBLIC_LIVE_ISH_FRAMES_ORIGIN: frames,
      NEXT_PUBLIC_LIVE_ISH_EXTERNAL: JSON.stringify(summary.hosts.external ?? {}),
      NEXT_PUBLIC_LIVE_ISH_PROVIDER: provider ?? "",
      // A preview cannot embed frames from a frames host that names production in `frame-ancestors`.
      NEXT_PUBLIC_LIVE_ISH_FRAMES_OFF: preview && mode === "two-hosts" ? "1" : "",
      // Read by server modules only, so client chunks never carry the host.
      LIVE_ISH_SITE: site,
      LIVE_ISH_PRESENTER: presenter ? "1" : "",
      LIVE_ISH_PREVIEW: preview ? "1" : "",
      LIVE_ISH_BUILD_FILE_HEADERS: JSON.stringify(PROVIDERS[provider]?.buildFileHeaders ?? {}),
      ...next.env,
    },
    turbopack: { ...next.turbopack, resolveAlias: { ...next.turbopack?.resolveAlias, ...aliases } },
    webpack(config, context) {
      config.resolve.alias["@live-ish/deck"] = generated;
      config.resolve.alias["@live-ish/analytics"] = analytics;
      return next.webpack ? next.webpack(config, context) : config;
    },
    // Files the server reads with fs at request time. Every read has a runtime path, which tracing
    // can't follow, so a deployment gets them from these globs.
    outputFileTracingIncludes: { ...next.outputFileTracingIncludes, "/**": [...summary.demoFiles, "./.live-ish/**/*", ...(next.outputFileTracingIncludes?.["/**"] ?? [])] },
    async rewrites() {
      return { beforeFiles: [...(presenter ? presenterRewrites(summary.firstSlide) : []), ...addressRewrites(summary.addresses)], afterFiles: [], fallback: [] };
    },
    async headers() {
      return [...headerRules({ production: process.env.NODE_ENV === "production", mode, site, frames, addresses: summary.addresses }), ...((await next.headers?.()) ?? [])];
    },
  };
}

exports.withDeck = withDeck;
