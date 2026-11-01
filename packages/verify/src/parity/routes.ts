import { eventually, get, inContext, open, titleOf, walkPage, type Check } from "./target";

const prerendered = (headers: Headers) => headers.get("x-nextjs-prerender") === "1" || headers.get("x-nextjs-cache") === "HIT" || headers.get("x-nextjs-cache") === "REVALIDATED";

/** A window route: answers, and comes from a prerendered page. */
function windowRoute(route: "present" | "speaker"): Check {
  return async (t) => {
    const { slides, routes } = t.manifest;
    const res = await get(t.origin, `${routes[route]}?s=${slides[0].id}`);
    return { answers: res.status === 200, prerendered: prerendered(res.headers) };
  };
}

export const routes: Record<string, Check> = {
  "RT-1": (t) =>
    inContext(t, async (context) => {
      const { slides, routes: r } = t.manifest;
      const home = await open(context, t, "/");
      const reader = await open(context, t, `${r.reader}/${slides[0].id}`);
      const stage = t.selectors.stage;
      const same = (await home.locator(stage).first().innerText()) === (await reader.locator(stage).first().innerText());
      await home.keyboard.press("ArrowRight");
      const moves = await eventually(async () => new URL(home.url()).pathname === `${r.reader}/${slides[1].id}`);
      return { rendersFirstSlide: same, movesToReaderRoute: moves };
    }),

  "RT-2": async (t) => {
    const { slides, routes: r } = t.manifest;
    const all = await Promise.all(slides.map((s) => get(t.origin, `${r.reader}/${s.id}`)));
    return { everySlideAnswers: all.every((res) => res.status === 200), everySlidePrerendered: all.every((res) => prerendered(res.headers)) };
  },

  "RT-3": async (t) => {
    const { slides, routes: r } = t.manifest;
    const res = await get(t.origin, `${r.reader}/2`);
    return { redirects: res.status >= 300 && res.status < 400, toSlideTwo: (res.headers.get("location") ?? "").endsWith(`${r.reader}/${slides[1].id}`) };
  },

  "RT-4": windowRoute("present"),
  "RT-5": windowRoute("speaker"),

  "RT-6": async (t) => {
    const { slides, routes: r } = t.manifest;
    const first = titleOf((await get(t.origin, `${r.present}?s=${slides[0].id}`)).text);
    const results = await Promise.all([`${r.present}`, `${r.present}?s=${encodeURIComponent("Not A Slide!")}`].map((p) => get(t.origin, p)));
    return { bareLandsOnFirst: results[0].status === 200 && titleOf(results[0].text) === first, malformedLandsOnFirst: results[1].status === 200 && titleOf(results[1].text) === first };
  },

  "RT-7": async (t) => {
    const { slides, routes: r } = t.manifest;
    const first = titleOf((await get(t.origin, `${r.present}?s=${slides[0].id}`)).text);
    const windowed = await get(t.origin, `${r.present}?s=no-such-slide`);
    const reader = await get(t.origin, `${r.reader}/no-such-slide`);
    return { windowLandsOnFirst: windowed.status === 200 && titleOf(windowed.text) === first, readerGets404: reader.status === 404 };
  },

  "RT-8": async (t) => {
    const { slides, pages, routes: r } = t.manifest;
    const res = await get(t.origin, r.health);
    const body = JSON.parse(res.text) as { ok?: boolean; build?: string; slides?: number; pages?: number };
    return { answers: res.status === 200 && body.ok === true, namesBuild: typeof body.build === "string" && body.build.length > 0, countsSlides: body.slides === slides.length, countsPages: body.pages === pages.length };
  },

  "RT-9": async (t) => {
    const res = await get(t.origin, "/no-such-address-at-all");
    return { answers404: res.status === 404, customPage: res.text.includes(`class="${t.selectors.notFound.slice(1)}"`) };
  },

  "RT-13": (t) =>
    inContext(t, async (context) => {
      const { slides, routes: r } = t.manifest;
      const kept = { glass: "off", capture: "1", fade: "0", rehearse: "1" };
      const page = await open(context, t, `${r.present}?s=${slides[0].id}&${new URLSearchParams(kept).toString()}`);
      await page.keyboard.press("ArrowRight");
      const moved = await eventually(async () => new URL(page.url()).searchParams.get("s") === slides[1].id);
      const after = new URL(page.url()).searchParams;
      const facts: Record<string, boolean> = { moved, ...Object.fromEntries(Object.entries(kept).map(([k, v]) => [`keeps_${k}`, after.get(k) === v])) };
      const walk = walkPage(t.manifest);
      if (!walk) return facts;
      const current = t.selectors.stepSegment;
      const nth = async (query: string) => {
        const reader = await open(context, t, `${r.reader}/${walk.id}?${query}`);
        const states = await reader.locator(current).evaluateAll((els) => els.map((el) => el.getAttribute("data-state")));
        await reader.close();
        return states.indexOf("current");
      };
      return { ...facts, stepOpensThatStep: (await nth("step=1")) === 1, stepLastOpensLastStep: (await nth("step=last")) === walk.steps.length - 1 };
    }),
};
