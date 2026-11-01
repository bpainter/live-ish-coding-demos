import "server-only";
import input from "@live-ish/deck";
import { demos } from "../content";
import { fromDeck } from "../paths";
import { beatDir, type DeckInput } from "../../schema/assemble";
import { hasFrame, type Demo, type FramePage } from "../../schema/demo";
import type { BuildBeat, BuildDef, BuildManifest, DemoFolder } from "./types";
import { matchRoute } from "./routes";

export const BASE_SANDBOX = "allow-scripts allow-same-origin";
export const FORMS_SANDBOX = "allow-scripts allow-same-origin allow-forms";

function baseManifest(demo: Demo, page: FramePage): BuildManifest {
  const beat = page.beat as BuildBeat;
  const terminal = page.frame.kind === "terminal";
  return {
    demo: demo.id,
    build: beat,
    kind: page.frame.kind,
    sandbox: BASE_SANDBOX,
    flags: Object.fromEntries(Object.keys(page.frame.flags ?? {}).map((k) => [k, true as const])),
    enhancement: terminal ? { css: { files: [] }, js: [] } : { css: "all", js: [] },
    instrumentation: [],
    probes: [],
    scrollers: terminal ? ["[data-terminal]"] : [],
    runtimeSelectors: [],
    background: Boolean(demo.background),
    chrome: page.chrome,
    base: page.frame.base,
  };
}

function buildFor(demo: Demo, page: FramePage): BuildDef {
  const beat = page.beat as BuildBeat;
  const source = (input as DeckInput).demos.find((d) => d.demo.id === demo.id);
  const config = source?.demo[beat];
  const kind = page.frame.kind;
  const dir = fromDeck(beatDir(demo.folder, kind, beat));
  const manifest = baseManifest(demo, page);
  manifest.styles = config?.styles;
  manifest.shell = config?.shell;
  manifest.csp = config?.csp;
  if (config?.sandbox) manifest.sandbox = config.sandbox;
  if (config?.enhancement) manifest.enhancement = { css: config.enhancement.css ?? manifest.enhancement.css, js: config.enhancement.js ?? manifest.enhancement.js };
  const title = `${demo.title}: ${page.title}`;
  if (kind === "terminal") {
    const recording = config?.recording ?? "session";
    return {
      manifest: { ...manifest, shell: config?.shell ?? { id: "terminal-window" } },
      dir,
      files: [],
      title,
      terminal: {
        recording,
        file: fromDeck(demo.folder, "recordings", `${recording}.json`),
        window: { title: config?.window?.title ?? demo.title, cwd: config?.window?.cwd ?? "~" },
      },
    };
  }
  const build: BuildDef = { manifest, dir, title, pages: config?.pages, inner: config?.inner, render: source?.render, address: config?.address };
  if (source?.hooks) {
    build.extraFiles = { "hooks.js": fromDeck(demo.folder, "hooks.js") };
    manifest.instrumentation = [`/demos/${demo.id}/${beat}/hooks.js`];
  }
  return build;
}

function folderOf(demo: Demo): DemoFolder {
  const builds: DemoFolder["builds"] = {};
  for (const page of demo.pages) {
    if (hasFrame(page) && page.frame.kind !== "server") builds[page.beat] = buildFor(demo, page);
  }
  return { demo: demo.id, builds, routes: demo.routes };
}

/** Every demo folder the frame routes can serve, derived from `order`. */
export const DEMO_FOLDERS: Record<string, DemoFolder> = Object.fromEntries(demos.map((d) => [d.id, folderOf(d)]));

export function demoFolder(demo: string): DemoFolder | undefined {
  return DEMO_FOLDERS[demo];
}

/**
 * The manifest behind a `Frame.route` such as /demos/faq/after, or null for other origins. A build
 * may own a root-level address: such a route resolves to the build of the folder whose `routes`
 * serve it.
 */
export function manifestFor(route: string): BuildManifest | null {
  const m = /^\/demos\/([\w-]+)\/(before|after|single)/.exec(route);
  if (m) return DEMO_FOLDERS[m[1]]?.builds[m[2] as BuildBeat]?.manifest ?? null;
  if (route.startsWith("/@")) return null;
  const pathname = route.split("?")[0];
  for (const f of Object.values(DEMO_FOLDERS)) {
    if (f.routes && matchRoute(f.routes, "GET", pathname)) return Object.values(f.builds).at(-1)?.manifest ?? null;
  }
  return null;
}

/** The build a root address opens, so the document it answers with is composed like any frame's. */
export function buildAtAddress(pathname: string): BuildDef | null {
  for (const f of Object.values(DEMO_FOLDERS)) {
    for (const def of Object.values(f.builds)) if (def.address?.split("?")[0] === pathname) return def;
  }
  return null;
}

/** All extra routes across demo folders, for the declared-address route. */
export function allExtraRoutes() {
  return Object.values(DEMO_FOLDERS).flatMap((f) => f.routes ?? []);
}
