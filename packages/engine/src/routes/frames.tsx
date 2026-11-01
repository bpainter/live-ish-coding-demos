import { readFileSync } from "node:fs";
import { join } from "node:path";
import { asBuildFile, buildFile, composeFrame, frameResponse } from "../lib/frames/compose";
import { innerDocument, innerResponse } from "../lib/frames/inner";
import { parseFlags } from "../lib/frames/origins";
import { requestOrigin } from "../lib/site";
import { demoFolder } from "../lib/frames/registry";
import { matchRoute } from "../lib/frames/routes";
import { readRecording, terminalBody, terminalWindow } from "../lib/frames/terminal";
import type { BuildBeat } from "../lib/frames/types";

/**
 * Frame documents and their files:
 *   /demos/<demo>/<beat>              the composed document (also at .../index.html so relative links resolve)
 *   /demos/<demo>/<beat>/<file>       a file of the build
 *   /demos/<demo>/<beat>/<anything>   a route the demo folder registered
 * Flags arrive on the request as ?flags=enhance-css:0,enhance-js:1, on every page of a build, so no
 * instance needs to remember them. The runtime carries them across a multi-page build's own links.
 * A terminal frame also takes ?chrome=<id>, which picks the theme its window links.
 */
type Ctx = { params: Promise<{ demo: string; build: string; path?: string[] }> };

function notFound(what: string): Response {
  return new Response(`${what} not found`, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const { demo, build, path = [] } = await ctx.params;
  const folder = demoFolder(demo);
  const def = folder?.builds[build as BuildBeat];
  const url = new URL(req.url);
  if (!folder || !def) return notFound("Demo build");
  // The CSP names the origin the document is actually served from; Next's req.url may carry the
  // configured hostname instead of the one the request arrived on (localhost vs 127.0.0.1).
  const origin = requestOrigin(req.headers, url);
  const rest = path.join("/");
  const page = rest === "" ? "index.html" : rest;
  if (req.method === "GET" && def.inner?.includes(page)) return innerResponse(innerDocument(join(/*turbopackIgnore: true*/ def.dir, page), def.title, def.manifest.styles), origin);
  if (req.method === "GET" && (page === "index.html" || def.pages?.includes(page))) {
    const flags = { ...Object.fromEntries(Object.keys(def.manifest.flags).map((k) => [k, true])), ...parseFlags(url.searchParams.get("flags")) };
    if (def.terminal) {
      const rec = readRecording(def.terminal.file);
      if (!rec) return notFound("Recording");
      const asked = url.searchParams.get("chrome");
      const chrome = asked && /^[a-z][a-z0-9-]*$/.test(asked) ? asked : def.manifest.chrome;
      return frameResponse(composeFrame(def, { flags, origin, body: terminalBody(rec), title: `${def.title}: ${rec.id}`, window: terminalWindow(def, rec), chrome }), def, origin, flags);
    }
    let body: string | undefined;
    if (page !== "index.html" || def.render) {
      const raw = readFileSync(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ def.dir, page), "utf8");
      try {
        body = def.render ? def.render(page, raw, url) : raw;
      } catch {
        return notFound("Demo record");
      }
    }
    return frameResponse(composeFrame(def, { flags, origin, body }), def, origin, flags);
  }
  if (req.method === "GET") {
    const file = buildFile(def, rest);
    if (file) return file;
  }
  const extra = folder.routes ? matchRoute(folder.routes, req.method, url.pathname) : null;
  if (extra) {
    const res = await extra.route.handler(req, { params: extra.params, url });
    // Images a folder serves beside its document are files, fixed per deployment. Every other
    // extra route keeps its own headers.
    return req.method === "GET" && res.headers.get("content-type")?.startsWith("image/") ? asBuildFile(res) : res;
  }
  return notFound("Demo file");
}

export const GET = handle;
export const POST = handle;
