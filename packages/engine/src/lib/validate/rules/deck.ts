import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { navGroups } from "../../nav-groups";
import { beatConfig, copySlides, defineRule, facts, framePages, publicExists, publicPath, whereDeck, whereDemo, wherePage, whereSlide } from "../context";
import { lintTheme } from "../theme";
import type { Rule } from "../types";


const isHttps = (url: string) => /^https:\/\/[^\s]+$/.test(url);

/** Deck-wide wiring: links, the drawer, groups, the clock and the theme files. */
export const rules: Rule[] = [
  defineRule("deck-links", "The deck's links are https URLs.", (ctx, add) => {
    const { deck } = ctx.deck;
    const links: [string, string | undefined][] = [
      ["speaker.url", deck.speaker.url],
      ["links.site.url", deck.links.site?.url],
      ["event.organizer.url", deck.event?.organizer?.url],
      ["theme.brand.url", deck.theme.brand?.url],
    ];
    for (const [field, url] of links) if (url && !isHttps(url)) add(whereDeck(field), `"${url}" must be an https URL.`);
    for (const s of copySlides(ctx)) {
      if (s.copy?.kind === "closing" && s.copy.url && !isHttps(s.copy.url)) add(whereSlide(ctx, s, "url"), `"${s.copy.url}" must be an https URL.`, { fix: "The QR code is built from it." });
    }
  }),

  defineRule("image-alt", "Every image says what it shows.", (ctx, add) => {
    // Types can't hold this: `check` reads the deck's data, and blank text passes any type.
    const blank = (alt: string | undefined) => !alt?.trim();
    const fix = "Say what the image shows, for someone who can't see it.";
    for (const s of copySlides(ctx)) {
      if (s.image && blank(s.image.alt)) add(whereSlide(ctx, s, "image.alt"), `${s.image.src} has no alt text.`, { fix });
      if (s.copy?.kind === "grid") {
        s.copy.cards.forEach((card, i) => {
          if (card.image && blank(card.image.alt)) add(whereSlide(ctx, s, `card ${i + 1}, image.alt`), `${card.image.src} has no alt text.`, { fix });
        });
      }
    }
    for (const demo of ctx.deck.demos) {
      for (const page of demo.pages) {
        if (page.beat === "intro" && page.visual && blank(page.visual.alt)) add(wherePage(demo, page, "visual.alt"), "The visual has no alt text.", { fix });
      }
    }
  }),

  defineRule("nav", "The drawer reaches every demo once, and its links resolve.", (ctx, add) => {
    const known = new Set(ctx.deck.slides.map((s) => s.id));
    const links = navGroups(ctx.deck.slides, ctx.deck.demos).flatMap((g) => g.links);
    for (const l of links) if (!known.has(l.slideId)) add(whereDeck("order"), `The drawer's "${l.label}" links to "${l.slideId}", which is not a slide.`);
    for (const demo of ctx.deck.demos) {
      const ids = demo.pages.map((p) => p.id);
      const n = links.filter((l) => ids.includes(l.slideId)).length;
      if (n !== 1) add(whereDemo(demo), `It appears ${n} times in the drawer, and it should appear once.`);
    }
  }),

  defineRule("group", "A navGroup is one run of demos, and a chip has an intro to sit on.", (ctx, add) => {
    const grouped = ctx.deck.demos.map((d, i) => ({ d, i })).filter(({ d }) => d.navGroup);
    for (let k = 1; k < grouped.length; k++) {
      const prev = grouped[k - 1];
      const cur = grouped[k];
      if (cur.d.navGroup === prev.d.navGroup && cur.i !== prev.i + 1) add(whereDemo(cur.d, "navGroup"), `Group "${cur.d.navGroup}" is split.`, { fix: "Its demos must follow one another in order." });
    }
    for (const demo of ctx.deck.demos) {
      if (demo.chip && !demo.pages.some((p) => p.beat === "intro")) add(whereDemo(demo, "chip"), `The chip "${demo.chip}" needs an intro page to sit on.`);
    }
  }),

  defineRule("timing", "The deck's minutes fit timing.target.", (ctx, add) => {
    const target = ctx.deck.deck.timing.target;
    if (target === undefined) return;
    const total = ctx.deck.slides.at(-1)?.timing.cumulative ?? 0;
    if (total > target + 0.001) add(whereDeck("timing.target"), `The deck runs ${total} minutes, and the target is ${target}.`, { fix: "Cut a demo, or give its pages fewer minutes." });
  }),

  defineRule("theme", "The deck's theme file and tokens are real.", (ctx, add) => {
    const theme = facts(ctx).input.config.theme;
    const custom = theme?.extends;
    if (custom && custom !== "default" && !existsSync(path.join(ctx.root, custom))) add(whereDeck("theme.extends"), `${custom} does not exist.`, { fix: `Use "default", or a path to a CSS file of tokens.` });
    for (const name of Object.keys(theme?.tokens ?? {})) {
      if (!name.startsWith("--deck-")) add(whereDeck(`theme.tokens.${name}`), `"${name}" is not a deck token.`, { fix: "Copy slide tokens start with --deck-." });
    }
  }),

  defineRule("theme-lint", "A demo's page CSS stays in its layers and paints only.", (ctx, add) => {
    for (const demo of ctx.deck.demos) {
      for (const page of framePages(demo)) {
        for (const href of beatConfig(ctx, demo, page)?.styles ?? []) {
          if (!publicExists(ctx, href)) add(wherePage(demo, page, "styles"), `${href} does not exist under public/.`);
          else for (const l of lintTheme(readFileSync(publicPath(ctx, href), "utf8"), { perDemo: true })) add(`public${href}:${l.line}`, l.message);
        }
      }
    }
  }),
];
