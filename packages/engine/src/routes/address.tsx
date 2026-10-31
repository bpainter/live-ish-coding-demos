import { allExtraRoutes } from "../lib/frames/registry";
import { matchRoute } from "../lib/frames/routes";

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
  return m.route.handler(req, { params: m.params, url });
}

export const GET = handle;
export const POST = handle;
