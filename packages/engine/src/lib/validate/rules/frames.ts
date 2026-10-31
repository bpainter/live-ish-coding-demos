import { existsSync } from "node:fs";
import path from "node:path";
import { beatDir } from "../../../schema/assemble";
import type { Step } from "../../../schema/demo";
import { matchRoute } from "../../frames/routes";
import { beatConfig, defineRule, demoFile, eachStep, facts, framePages, whereDeck, whereDemo, wherePage, whereStep } from "../context";
import { frameDocuments, frameHooks, namedInScript, selectorMiss } from "../dom";
import type { Rule } from "../types";

/** Every root address the deck's own shell serves. A demo route here would hide it. */
export const RESERVED_ROUTES = ["/s", "/present", "/speaker", "/_health", "/%5Fhealth", "/demos", "/live-ish", "/live-ish-address", "/_next", "/robots.txt", "/sitemap.xml", "/favicon.ico"];

/** Does a demo's address sit on, under or over a reserved one? A pattern is tried on what the shell serves. */
function clashes(reserved: string, address: string | RegExp): boolean {
  if (typeof address !== "string") {
    const re = new RegExp(address.source, address.flags.replace("g", ""));
    return re.test(reserved) || re.test(`${reserved}/x`);
  }
  const own = address.replace(/\/$/, "");
  return own === reserved || own.startsWith(`${reserved}/`) || reserved.startsWith(`${own}/`);
}

/** Where a step names a selector, with the field a finding should point at. */
function selectorsIn(step: Step): { selector: string; field: string }[] {
  const out: { selector: string; field: string }[] = [];
  for (const s of step.spotlight ?? []) out.push({ selector: s, field: "spotlight" });
  for (const c of step.callouts ?? []) out.push({ selector: c.target, field: "callout" });
  step.actions.forEach((a, i) => {
    if ("target" in a && typeof a.target === "string") out.push({ selector: a.target, field: `action ${i} (${a.type})` });
    if (a.type === "pointer") out.push({ selector: a.to, field: `action ${i} (pointer)` });
  });
  return out.filter((s) => s.selector !== ":viewport");
}

/** A frame's files, its selectors, its hooks and its addresses. */
export const rules: Rule[] = [
  defineRule("build", "Every id in order and every frame has the files behind it.", (ctx, add) => {
    for (const miss of facts(ctx).missing) add(whereDeck("order"), `"${miss.id}" is in order, but no slide has that id and there is no demo folder for it.`, { fix: `Looked in ${miss.looked}.${miss.hint ? ` Did you mean "${miss.hint}"?` : ""}` });
    for (const demo of ctx.deck.demos) {
      for (const page of framePages(demo)) {
        const config = beatConfig(ctx, demo, page);
        const dir = beatDir(demo.folder, page.frame.kind, page.beat);
        if (page.frame.kind === "server") {
          const app = config?.frame?.app;
          if (app && !ctx.deck.deck.hosts.external[app]) add(wherePage(demo, page, "frame"), `App "${app}" has no origin.`, { fix: `Add it to hosts.external in deck.config.ts. Known: ${Object.keys(ctx.deck.deck.hosts.external).join(", ") || "none"}.` });
          continue;
        }
        if (page.frame.kind === "terminal") {
          const recording = config?.recording ?? "session";
          const file = path.join(demo.folder, "recordings", `${recording}.json`);
          if (!existsSync(path.join(ctx.root, file))) add(wherePage(demo, page, "recording"), `${file} does not exist.`, { fix: `Run live-ish record ${demo.id}.` });
          continue;
        }
        if (config?.address) {
          const pathname = config.address.split("?")[0];
          const served = ctx.deck.demos.some((d) => d.routes && matchRoute(d.routes, "GET", pathname));
          if (!served) add(wherePage(demo, page, "address"), `No routes.ts serves ${config.address}.`);
          continue;
        }
        for (const file of ["index.html", ...(config?.pages ?? [])]) {
          const name = file.split("?")[0];
          if (!existsSync(path.join(ctx.root, dir, name))) add(wherePage(demo, page), `${dir}/${name} does not exist.`, { fix: `Add the page's markup at ${path.join(ctx.root, dir, name)}.` });
        }
      }
    }
  }),

  defineRule("selector", "A step's selectors match the demo's own files.", (ctx, add) => {
    for (const { demo, page, step } of eachStep(ctx)) {
      const documents = frameDocuments(ctx, demo, page);
      if (!documents.length) continue;
      const runtime = beatConfig(ctx, demo, page)?.runtimeSelectors ?? [];
      const seen = new Set<string>();
      for (const { selector, field } of selectorsIn(step)) {
        if (runtime.includes(selector) || seen.has(`${selector}|${field}`)) continue;
        seen.add(`${selector}|${field}`);
        const miss = selectorMiss(documents, selector);
        if (!miss) continue;
        const found = miss.found.length ? `Found: ${miss.found.join(", ")}.` : `This file has no ${miss.kind}.`;
        const runtimeFix = namedInScript(ctx, demo, page, miss.token) ? ` If a script creates it, add it to ${page.beat}.runtimeSelectors in demo.ts.` : "";
        add(whereStep(demo, page, step, field), `${JSON.stringify(selector)} matches nothing in ${documents.map((d) => d.label).join(", ")}.`, { fix: `${found}${runtimeFix}` });
      }
    }
  }),

  defineRule("hook", "A hook a page calls is defined in its scripts.", (ctx, add) => {
    for (const demo of ctx.deck.demos) {
      for (const page of framePages(demo)) {
        if (page.frame.kind === "server") continue;
        const { names, complete, files } = frameHooks(ctx, demo, page);
        // A script that builds demoHooks in a way no static read can follow proves nothing.
        if (!complete) continue;
        const check = (name: string, where: string) => {
          if (names.includes(name)) return;
          add(where, `Hook "${name}" is not defined in ${files.join(", ") || `${demo.folder}/hooks.js`}.`, { fix: names.length ? `Found: ${names.join(", ")}.` : `Add window.demoHooks = { ${name}() {} } to ${demo.folder}/hooks.js.` });
        };
        for (const name of page.frame.hooks ?? []) check(name, wherePage(demo, page, "hooks"));
        for (const step of page.steps) {
          step.actions.forEach((a, i) => {
            if (a.type === "hook") check(a.name, whereStep(demo, page, step, `action ${i} (hook)`));
          });
        }
      }
    }
  }),

  defineRule("reserved-route", "A demo's root addresses leave the deck's own routes alone.", (ctx, add) => {
    const claimed = new Map<string, string>();
    for (const demo of ctx.deck.demos) {
      const addresses = [...(demo.routes ?? []).map((r) => r.path), ...framePages(demo).flatMap((p) => beatConfig(ctx, demo, p)?.address?.split("?")[0] ?? [])];
      for (const address of new Set(addresses)) {
        const shown = typeof address === "string" ? address : String(address);
        const clash = address === "/" ? "/" : RESERVED_ROUTES.find((r) => clashes(r, address));
        if (clash) add(whereDemo(demo, "routes"), `${shown} clashes with ${clash}, which the deck serves itself.`, { fix: "Keep demo routes under a name of their own, such as /orders." });
        const other = claimed.get(shown);
        if (other && other !== demo.id) add(whereDemo(demo, "routes"), `${shown} is also claimed by ${demoFile({ folder: `demos/${other}` })}.`, { fix: "Each address belongs to one demo." });
        claimed.set(shown, demo.id);
      }
    }
  }),
];
