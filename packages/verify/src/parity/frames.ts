import { framedPages, get, inContext, open, type Check, type Fetched, type Target } from "./target";

/** One document per kind of frame is enough, and keeps a large deck's run short. */
function samples(t: Target) {
  const seen = new Set<string>();
  return framedPages(t.manifest).filter((p) => {
    const kind = p.frame!.kind;
    if (seen.has(kind)) return false;
    seen.add(kind);
    return true;
  });
}

const csp = (res: Fetched) => res.headers.get("content-security-policy") ?? "";

export const frames: Record<string, Check> = {
  "RT-10": async (t) => {
    const pages = framedPages(t.manifest);
    if (!pages.length) return null;
    const documents = await Promise.all(pages.map((p) => get(t.framesOrigin, p.frame!.route)));
    const indexes = await Promise.all(pages.map((p) => get(t.framesOrigin, `${p.frame!.route}/index.html`)));
    const html = (res: Fetched) => res.status === 200 && (res.headers.get("content-type") ?? "").startsWith("text/html");
    return {
      everyDocumentAnswers: documents.every(html),
      everyIndexAnswers: indexes.every(html),
      carriesRuntime: documents.every((d) => /demo-runtime\.js/.test(d.text)),
      namesPresenter: documents.every((d) => /<meta name="presenter-origin"/.test(d.text)),
    };
  },

  "RT-11": async (t) => {
    const { routes, pages } = t.manifest;
    const opened = pages.flatMap((p) => (p.frame && p.frame.kind !== "server" && !p.frame.route.startsWith(`${routes.frames}/`) ? [p.frame.route] : []));
    const addresses = [...new Set([...routes.addresses, ...opened])];
    if (!addresses.length) return null;
    const results = await Promise.all(addresses.map((a) => get(t.framesOrigin, a)));
    return { everyAddressAnswers: results.every((r) => r.status < 400) };
  },

  "FR-3": async (t) => {
    const pages = samples(t);
    if (!pages.length) return null;
    const docs = await Promise.all(pages.map((p) => get(t.framesOrigin, p.frame!.route)));
    return {
      everyDocumentHasCsp: docs.every((d) => csp(d).length > 0),
      defaultDenied: docs.every((d) => csp(d).includes("default-src 'none'")),
      framedOnlyByPresenter: docs.every((d) => new RegExp(`frame-ancestors ${t.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(;|$)`).test(csp(d))),
    };
  },

  "FR-5": async (t) => {
    const pages = samples(t);
    if (!pages.length) return null;
    return inContext(t, async (context) => {
      const matches = [];
      for (const p of pages) {
        const page = await open(context, t, `${t.manifest.routes.present}?s=${p.id}`);
        const frame = page.locator(t.selectors.frame).first();
        await frame.waitFor({ state: "attached" });
        matches.push((await frame.getAttribute("sandbox")) === p.frame!.sandbox);
        await page.close();
      }
      return { sandboxAsDeclared: matches.every(Boolean) };
    });
  },

  // `check` confirms a server is configured. What this adds is that the target started it.
  "FR-20": async (t) => {
    const { servers } = t.manifest;
    if (!servers.length) return null;
    const up = await Promise.all(servers.map((s) => fetch(`http://localhost:${s.port}/`, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false)));
    return { everyServerAnswers: up.every(Boolean) };
  },
};
