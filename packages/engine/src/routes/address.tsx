import { composeFrame, frameResponse } from "../lib/frames/compose";
import { parseFlags } from "../lib/frames/origins";
import { allExtraRoutes, buildAtAddress } from "../lib/frames/registry";
import { matchRoute } from "../lib/frames/routes";
import { requestOrigin } from "../lib/site";

/**
 * The one route behind every address a demo declares in `routes.ts`, so shown code keeps real paths
 * such as /orders. `withDeck()` rewrites only declared addresses here, which leaves every other path
 * to Next, so the custom 404 page still answers an unknown one. A route handler can't render it.
 */
type Ctx = { params: Promise<{ address: string[] }> };

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const { address } = await ctx.params;
  const pathname = `/${address.join("/")}`;
  const url = new URL(req.url);
  url.pathname = pathname;
  const m = matchRoute(allExtraRoutes(), req.method, pathname);
  if (!m) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const res = await m.route.handler(req, { params: m.params, url });
  // The document a beat opens at this address: what the handler answered, inside the frame shell, so
  // the runtime and the CSP reach it. Anything else is the demo's own response.
  const def = req.method === "GET" && res.ok ? buildAtAddress(pathname) : null;
  if (!def || !res.headers.get("content-type")?.startsWith("text/html")) return res;
  const flags = { ...Object.fromEntries(Object.keys(def.manifest.flags).map((k) => [k, true])), ...parseFlags(url.searchParams.get("flags")) };
  const origin = requestOrigin(req.headers, url);
  return frameResponse(composeFrame(def, { flags, origin, body: await res.text() }), def, origin, flags);
}

export const GET = handle;
export const POST = handle;
