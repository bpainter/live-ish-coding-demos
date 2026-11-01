import type { Check, Target } from "./target";
import { get, inContext, metaOf, open, titleOf } from "./target";

const canonicalOf = (html: string) => /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/.exec(html)?.[1] ?? /<link[^>]+href="([^"]*)"[^>]+rel="canonical"/.exec(html)?.[1] ?? "";

function jsonLd(html: string): { "@type"?: string | string[] }[] {
  const graphs = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as { "@graph"?: { "@type"?: string }[] });
  return graphs.flatMap((g) => g["@graph"] ?? [g as { "@type"?: string }]);
}

const readerPages = (t: Target) => Promise.all(t.manifest.slides.map((s) => get(t.origin, `${t.manifest.routes.reader}/${s.id}`)));

/** Scripts that would mean analytics loaded, by the addresses the two products use. */
const ANALYTICS = /_vercel\/|\/insights\/|speed-insights|va\.vercel-scripts/;

/** Whether a route asks for analytics, from a real browser under automation. */
function analytics(t: Target, path: string) {
  return inContext(t, async (context) => {
    const asked: string[] = [];
    context.on("request", (r) => {
      if (ANALYTICS.test(r.url())) asked.push(r.url());
    });
    const page = await open(context, t, path);
    await page.waitForTimeout(300);
    return asked.length > 0;
  });
}

const analyticsOff: Check = async (t) => {
  const { slides, routes } = t.manifest;
  return { offForReaderUnderAutomation: !(await analytics(t, `${routes.reader}/${slides[0].id}`)), offInPresenter: !(await analytics(t, `${routes.present}?s=${slides[0].id}`)) };
};

export const seo: Record<string, Check> = {
  "SE-1": async (t) => {
    const pages = await readerPages(t);
    t.evidence(pages.map((p) => titleOf(p.text)));
    const { slides, routes } = t.manifest;
    return {
      everySlideHasTitle: pages.every((p) => titleOf(p.text).length > 0),
      everySlideHasDescription: pages.every((p) => metaOf(p.text, "description").length > 0),
      everySlideHasCanonical: pages.every((p, i) => canonicalOf(p.text) === `${t.origin}${routes.reader}/${slides[i].id}`),
    };
  },

  "SE-2": async (t) => {
    const pages = await readerPages(t);
    const has = (key: string) => pages.every((p) => metaOf(p.text, key).length > 0);
    return { ogTitle: has("og:title"), ogDescription: has("og:description"), ogUrl: has("og:url"), twitterCard: has("twitter:card") };
  },

  "SE-4": async (t) => {
    const { slides, routes, event } = t.manifest;
    const home = jsonLd((await get(t.origin, "/")).text).flatMap((n) => n["@type"] ?? []);
    const slide = jsonLd((await get(t.origin, `${routes.reader}/${slides[1].id}`)).text).flatMap((n) => n["@type"] ?? []);
    return { talkNode: home.includes("PresentationDigitalDocument"), speakerNode: home.includes("Person"), slideNode: slide.includes("CreativeWork"), ...(event ? { sessionNode: home.includes("Event") } : {}) };
  },

  "SE-5": async (t) => {
    const { slides, routes } = t.manifest;
    const res = await get(t.origin, "/sitemap.xml");
    return { answers: res.status === 200, listsEverySlide: slides.every((s) => res.text.includes(`${routes.reader}/${s.id}<`)) };
  },

  "SE-6": async (t) => {
    const site = await get(t.origin, "/robots.txt");
    const frames = await get(t.framesOrigin, "/robots.txt");
    return {
      siteAllowsReaders: /User-agent: \*\nAllow: \//.test(site.text),
      siteClosesWindows: /Disallow: \/present/.test(site.text) && /Disallow: \/speaker/.test(site.text),
      previewBotGroup: /User-agent: Slackbot/.test(site.text),
      namesSitemap: /Sitemap: /.test(site.text),
      framesHostClosed: /User-agent: \*\nDisallow: \/\n/.test(frames.text),
    };
  },

  "SE-7": async (t) => {
    const { slides, routes } = t.manifest;
    const windows = await Promise.all([routes.present, routes.speaker].map((r) => get(t.origin, `${r}?s=${slides[0].id}`)));
    const frames = await get(t.framesOrigin, "/");
    return { windowsNoindex: windows.every((w) => metaOf(w.text, "robots").includes("noindex")), framesHostTagged: (frames.headers.get("x-robots-tag") ?? "").includes("noindex") };
  },

  "SE-8": async (t) => {
    const { linkTags } = t.manifest;
    if (!linkTags.length) return null;
    const pages = await readerPages(t);
    const hrefs = pages.flatMap((p) => [...p.text.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&")));
    const external = hrefs.filter((h) => !h.startsWith(t.origin));
    return { outboundLinkTagged: linkTags.every((tag) => external.some((h) => new URL(h).searchParams.has(tag))) };
  },

  "OT-1": analyticsOff,
  "OT-2": analyticsOff,
};
