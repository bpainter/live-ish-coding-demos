/** A server route a demo folder adds on the demo origin. */
export interface ServerRoute {
  method: "GET" | "POST";
  /** Exact path or a RegExp tested against the pathname. */
  path: string | RegExp;
  handler: (req: Request, ctx: { params: Record<string, string>; url: URL }) => Response | Promise<Response>;
}

export function matchRoute(routes: ServerRoute[], method: string, pathname: string): { route: ServerRoute; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    if (typeof route.path === "string") {
      if (route.path === pathname) return { route, params: {} };
    } else {
      const m = route.path.exec(pathname);
      if (m) return { route, params: m.groups ?? {} };
    }
  }
  return null;
}
