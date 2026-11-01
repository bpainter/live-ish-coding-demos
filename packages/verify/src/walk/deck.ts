import type { Frame, Page } from "@playwright/test";
import { isBackgroundFile, type Slide } from "@live-ish/engine/verify";
import type { Checks } from "../lib/report";
import type { Session } from "../lib/session";
import { VT_WATCH } from "../lib/watch";

/**
 * The whole deck in order: each slide on its background, decoded before arrival, the grain at its
 * token, the footers and the closing slide. The address names each slide as it lands, and a press
 * that a frame swap swallowed is pressed again, because arrival is not what this walk tests.
 */

type Link = { href: string; target: string | null; rel: string; hidden: string; tabIndex: number };

async function linksIn(page: Page, scope: string): Promise<Link[]> {
  return (await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(`${scope} a[href]`)})].map((a) => ({ href: a.getAttribute("href"), target: a.getAttribute("target"), rel: a.getAttribute("rel") || "", hidden: a.querySelector(".visually-hidden")?.textContent || "", tabIndex: a.tabIndex }))`)) as Link[];
}

function checkLink(report: Checks, where: string, label: string, links: Link[], href: string, rel: string[]) {
  const l = links.find((x) => x.href === href);
  if (!l) return report.fail(where, `${label}: no link to ${href}`);
  const problems: string[] = [];
  if (l.target !== "_blank") problems.push(`target ${l.target}`);
  const rels = l.rel.split(/\s+/);
  for (const r of rel) if (!rels.includes(r)) problems.push(`rel lacks ${r}`);
  if (!/opens in a new tab/.test(l.hidden)) problems.push('no hidden "opens in a new tab" text');
  // The audience window never gives a link the clicker's keys.
  if (l.tabIndex !== -1) problems.push(`tabIndex ${l.tabIndex} in the audience window`);
  if (problems.length) report.fail(where, `${label}: ${problems.join(", ")}`);
  else report.pass(`${label}: ${href}, new tab, rel ${rel.join(" ")}, out of the audience tab order`);
}

/** `links.tag` on an outbound link, as the engine writes it. */
function outbound(session: Session, url: string, slideId: string): string {
  const tag = session.deck.deck.links.tag;
  if (!tag) return url;
  const out = new URL(url);
  for (const [k, v] of Object.entries(tag)) out.searchParams.set(k, v.replace("{slide}", slideId));
  return out.toString();
}

/** Per slide, as it arrived: no audience menu under automation, the footer link, cover and intro. */
async function checkSlide(session: Session, page: Page, slide: Slide) {
  const { report, deck } = session;
  const where = slide.id;
  const menu = (await page.evaluate(`document.querySelectorAll(".reader-controls--audience, .nav-drawer-trigger").length`)) as number;
  if (menu) report.fail(where, `the audience window renders a menu button under automation (${menu})`);
  const site = deck.deck.links.site;
  if (site && (await page.$("#stage .slide__footer-link"))) checkLink(report, where, `${where} footer`, await linksIn(page, "#stage .slide__footer"), outbound(session, site.url, slide.id), ["noopener"]);
  if (slide.layout === "title") {
    const speaker = deck.deck.speaker;
    if (speaker.url) checkLink(report, where, "cover name", await linksIn(page, "#stage"), outbound(session, speaker.url, slide.id), ["me", "noopener"]);
    const g = (await page.evaluate(`(() => {
      const els = [...document.querySelectorAll("#stage .cover__slug, #stage .cover__display, #stage .cover__byline")];
      if (!els.length) return null;
      const canvas = document.querySelector(".stage__canvas").getBoundingClientRect();
      const s = canvas.width / 1920;
      const rs = els.map((e) => e.getBoundingClientRect());
      return { top: (Math.min(...rs.map((r) => r.top)) - canvas.top) / s, bottom: (Math.max(...rs.map((r) => r.bottom)) - canvas.top) / s };
    })()`)) as { top: number; bottom: number } | null;
    if (!g) report.fail(where, "cover: no slug, title and byline");
    else if (g.top < 0 || g.bottom > 1080) report.fail(where, `cover: the group runs ${g.top.toFixed(0)} to ${g.bottom.toFixed(0)}, off the 1080 px canvas`);
    else report.pass(`cover: the group runs ${g.top.toFixed(0)} to ${g.bottom.toFixed(0)} on the canvas`);
  }
  if (slide.page?.beat === "intro") {
    const v = (await page.evaluate(`(() => {
      const text = document.querySelector("#stage .intro__text");
      const canvas = document.querySelector(".stage__canvas").getBoundingClientRect();
      const s = canvas.width / 1920;
      return { height: text ? text.getBoundingClientRect().height / s : 0, overflow: text ? text.scrollHeight > text.clientHeight + 1 : false };
    })()`)) as { height: number; overflow: boolean };
    if (v.height > 952.5 || v.overflow) report.fail(where, `intro panel is ${v.height.toFixed(1)} px tall${v.overflow ? " and overflows" : ""}; it must fit 952`);
  }
}

/** A closing slide: whole QR modules of 12 stage px or more, and the speaker's name, role and link. */
async function checkClosing(session: Session, page: Page, slide: Slide) {
  const { report, deck } = session;
  const closing = slide.copy?.kind === "closing" ? slide.copy : null;
  if (!closing) return;
  const links = await linksIn(page, "#stage");
  if (closing.url) {
    const url = outbound(session, closing.url, slide.id);
    const all = links.filter((l) => l.href === url);
    if (all.length < 2) report.fail("closing", `${all.length} link(s) to ${url}; the line and the QR code both link`);
    for (const [i, l] of all.entries()) checkLink(report, "closing", `closing link ${i + 1}`, [l], url, ["me", "noopener"]);
    await page.waitForSelector("#stage .qr__code", { timeout: 5000 }).catch(() => null);
  }
  const v = (await page.evaluate(`(async () => {
    const canvas = document.querySelector(".stage__canvas").getBoundingClientRect();
    const scale = canvas.width / 1920;
    // The visible text only: a new-tab link carries a hidden ", opens in a new tab".
    const text = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return "";
      const clone = el.cloneNode(true);
      clone.querySelectorAll(".visually-hidden, .sr-only").forEach((h) => h.remove());
      return clone.textContent.trim();
    };
    const out = { width: 0, modules: 0, name: text("#stage .closing__name"), role: text("#stage .closing__role") };
    const img = document.querySelector("#stage .qr__code");
    if (img) {
      await img.decode().catch(() => {});
      out.width = img.getBoundingClientRect().width / scale;
      const svg = await (await fetch(img.getAttribute("src"))).text();
      out.modules = Number(/data-modules="(\\d+)"/.exec(svg)?.[1] || 0);
    }
    return out;
  })()`)) as { width: number; modules: number; name: string; role: string };
  const problems: string[] = [];
  if (closing.url) {
    const px = v.modules ? v.width / v.modules : 0;
    if (Math.abs(px - Math.round(px)) >= 0.01 || px < 12) problems.push(`QR modules are ${px.toFixed(2)} stage px`);
  }
  if (v.name !== deck.deck.speaker.name) problems.push(`name reads "${v.name}"`);
  if (deck.deck.role && v.role !== deck.deck.role) problems.push(`role reads "${v.role}"`);
  if (problems.length) report.fail("closing", problems.join("; "));
  else report.pass(`closing: ${closing.url ? `QR at ${Math.round(v.width / v.modules)} stage px per module, ` : ""}name and role match the deck`);
}

/** Walks the deck slide by slide with Shift+ArrowRight. */
export async function walkDeck(session: Session) {
  const { report, deck } = session;
  const { slides } = deck;
  report.section(`deck (${slides.length} slides)`);
  const ctx = await session.context({ viewport: { width: 1600, height: 900 } });
  await ctx.addInitScript(VT_WATCH);
  const page = await ctx.newPage();
  try {
    await page.goto(session.present(slides[0].id));
    const grainOn = deck.deck.theme.grain;
    const problems: string[] = [];
    for (const [i, slide] of slides.entries()) {
      const arrived = await page
        .waitForFunction((id) => new URLSearchParams(location.search).get("s") === id && Boolean(document.querySelector("#stage")), slide.id, { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (!arrived) problems.push(`${slide.id}: never arrived`);
      else {
        // A file comes with the walk's image; a CSS value has no file to decode.
        const want = slide.background && isBackgroundFile(slide.background) ? slide.background : undefined;
        if (want) {
          const on = await page
            .waitForFunction((w) => document.querySelector(".stage__canvas")?.getAttribute("data-background") === w, want, { timeout: 8000 })
            .then(() => true)
            .catch(() => false);
          if (!on) problems.push(`${slide.id}: never showed ${want}`);
        }
        const v = (await page.evaluate(`(() => {
          const bg = document.querySelector(".stage__bg");
          const grain = document.querySelector(".stage__grain");
          return { image: bg ? getComputedStyle(bg).backgroundImage : "", grain: grain ? Number(getComputedStyle(grain).opacity) : null, blend: grain ? getComputedStyle(grain).mixBlendMode : null, token: getComputedStyle(document.querySelector(".stage__canvas")).getPropertyValue("--stage-grain").trim(), decoded: window.__decodedBackgrounds || [] };
        })()`)) as { image: string; grain: number | null; blend: string | null; token: string; decoded: string[] };
        if (want && !v.image.includes(want)) problems.push(`${slide.id}: background is ${v.image.slice(0, 80)}, not ${want}`);
        if (slide.background && !want && v.image === "none") problems.push(`${slide.id}: the background value did not paint`);
        if (want && i > 0 && !v.decoded.some((d) => d === want || d.endsWith(".avif"))) problems.push(`${slide.id}: ${want} was not decoded before arrival`);
        if (grainOn && v.grain === null) problems.push(`${slide.id}: no grain layer`);
        if (!grainOn && v.grain !== null) problems.push(`${slide.id}: a grain layer on a deck with grain off`);
        if (v.grain !== null && (Math.abs(v.grain - Number(v.token)) > 0.001 || v.blend !== "overlay")) problems.push(`${slide.id}: grain at ${v.grain} ${v.blend}; the token says ${v.token} overlay`);
        await checkSlide(session, page, slide);
        await checkClosing(session, page, slide);
      }
      if (i < slides.length - 1) {
        const nextId = slides[i + 1].id;
        let moved = false;
        for (let attempt = 0; attempt < 4 && !moved; attempt++) {
          await page.keyboard.press("Shift+ArrowRight");
          moved = await page
            .waitForFunction((id) => new URLSearchParams(location.search).get("s") === id, nextId, { timeout: 2500 })
            .then(() => true)
            .catch(() => false);
        }
        await page.waitForTimeout(400);
      }
    }
    if (problems.length) for (const p of problems) report.fail("deck", p);
    else report.pass(`deck: ${slides.length} slides in order, each on its background, grain ${grainOn ? "at its token" : "off"}`);
    const health = (await (await fetch(`${session.origin}/_health`)).json().catch(() => null)) as { slides: number; pages: number } | null;
    const pages = deck.demos.reduce((n, d) => n + d.pages.length, 0);
    if (health?.slides !== slides.length || health.pages !== pages) report.fail("deck", `/_health reports ${JSON.stringify(health)}; the deck has ${slides.length} slides and ${pages} pages`);
    else report.pass(`/_health: ${health.slides} slides, ${health.pages} pages`);
    const vt = (await page.evaluate(`window.__vtCount ?? null`)) as number | null;
    if (vt === null) report.fail("deck", "view transition watch not installed");
    else if (vt > 0) report.fail("deck", `${vt} view transition(s) ran under automation; the fade must be off`);
    else report.pass("deck: no view transition under automation");
  } finally {
    await ctx.close();
  }
}

/** Mean per-channel difference between two 16 by 9 thumbnails, 0 to 255. */
function thumbDistance(a: number[][], b: number[][]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) for (let c = 0; c < 3; c++) sum += Math.abs(a[i][c] - b[i][c]);
  return sum / (a.length * 3);
}

/** Every pair of measured backgrounds differs. Needs `backgrounds` to have run. */
export function checkDistinct(stats: Record<string, { thumb: number[][] }>, report: Checks) {
  const ids = Object.keys(stats);
  if (ids.length < 2) return;
  let worst = { d: Infinity, pair: "" };
  const close: string[] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const d = thumbDistance(stats[ids[i]].thumb, stats[ids[j]].thumb);
      if (d < worst.d) worst = { d, pair: `${ids[i]} and ${ids[j]}` };
      if (d < 12) close.push(`${ids[i]} and ${ids[j]} (${d.toFixed(1)})`);
    }
  if (close.length) report.fail("backgrounds", `thumbnails too similar: ${close.join(", ")}`);
  else report.pass(`backgrounds: all ${(ids.length * (ids.length - 1)) / 2} pairs differ by 12 or more per channel (closest ${worst.pair}, ${worst.d.toFixed(1)})`);
}

/** A frame on its demo's background, at the slide's alignment. */
export async function checkFrameBackground(frame: Frame | null, where: string, background: string, report: Checks) {
  if (!frame) return report.fail(where, "frame background: no frame");
  const v = (await frame
    .evaluate(`(() => {
      const cs = getComputedStyle(document.body);
      return { bg: document.documentElement.dataset.sectionBg || null, size: cs.backgroundSize, position: cs.backgroundPosition, attachment: cs.backgroundAttachment, image: cs.backgroundImage };
    })()`)
    .catch(() => null)) as { bg: string | null; size: string; position: string; attachment: string; image: string } | null;
  if (!v) return report.fail(where, "frame background: the frame did not answer");
  // Split a computed multi-layer value at top-level commas, because layers nest parentheses.
  const layer = (list: string) => {
    const out: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of list) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const images = layer(v.image);
  // The second layer holds the image: the wash, the image, the fallback.
  const name = isBackgroundFile(background) ? (background.split("/").pop() as string) : null;
  const idx = name ? images.findIndex((x) => x.includes(name)) : 1;
  const nums = (s: string | undefined) => (s ?? "").match(/-?[\d.]+/g)?.map(Number) ?? [];
  const size = nums(layer(v.size)[idx]);
  const pos = nums(layer(v.position)[idx]);
  const near = (a: number[], b: number[]) => a.length === b.length && a.every((n, k) => Math.abs(n - b[k]) <= 0.5);
  const problems: string[] = [];
  if (!v.bg) problems.push("no data-section-bg");
  if (idx < 0 || images[idx] === undefined || images[idx] === "none") problems.push(`body shows no ${name ?? "image"}`);
  else {
    if (!near(size, [1396.36, 785.45])) problems.push(`size ${layer(v.size)[idx]}`);
    if (!near(pos, [-47.27, -128.73])) problems.push(`position ${layer(v.position)[idx]}`);
    // A shorter list repeats for the remaining layers, as Firefox reports it.
    const att = layer(v.attachment);
    if (!att[idx % att.length]?.includes("fixed")) problems.push(`attachment ${v.attachment}`);
  }
  if (problems.length) report.fail(where, `frame background: ${problems.join("; ")}`);
  else report.pass(`frame on its background at 1396.36 by 785.45, offset -47.27 -128.73, fixed`);
}
