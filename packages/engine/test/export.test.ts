import assert from "node:assert/strict";
import { test } from "node:test";
import { flagCombinations, frameRefs, planExport, staticFrame } from "../src/export/plan";
import { deckManifest } from "../src/export/manifest";
import { flagFile } from "../src/lib/frames/origins";
import type { Action, Demo, FramePage } from "../src/schema/demo";

function page(overrides: Partial<FramePage["frame"]> = {}, actions: Action[][] = [[]], route?: string): FramePage {
  return {
    id: "p-after",
    beat: "after",
    notes: "",
    chrome: "glass",
    split: "50/50",
    eyebrow: "",
    title: "",
    timing: { minutes: 1, cumulative: 1 },
    files: [],
    steps: actions.map((a, i) => ({ id: `s${i}`, label: "", actions: a, notes: [], route })),
    frame: { kind: "web", route: "/demos/p/after", viewport: { width: 640, height: 628 }, ...overrides },
  } as FramePage;
}

const demo = (pages: FramePage[], extra: Partial<Demo> = {}): Demo => ({ id: "p", order: 1, folder: "demos/p", title: "", scenario: "", pages, citations: [], cautions: [], ...extra });

test("a flag file names only what is off, and only flags a build knows", () => {
  assert.equal(flagFile({}), "index.html");
  assert.equal(flagFile({ "enhance-css": true }), "index.html");
  assert.equal(flagFile({ "enhance-js": false, "enhance-css": false }), "index.off-enhance-css.off-enhance-js.html");
  assert.equal(flagFile({ glass: false, capture: true, "enhance-css": false }), "index.off-enhance-css.html");
});

test("combinations follow toggles in steps and across a reload", () => {
  const combos = flagCombinations(
    page({ flags: { "enhance-css": true, "enhance-js": true } }, [
      [],
      [{ type: "toggle", flag: "enhance-css", on: false }],
      [
        { type: "toggle", flag: "enhance-js", on: false },
        { type: "toggle", flag: "enhance-css", on: true },
        { type: "toggle", flag: "enhance-js", on: true },
      ],
    ]),
  );
  // The CSS toggle lands before the reload, so no document ever mounts with both off.
  assert.deepEqual(combos.map(flagFile).sort(), ["index.html", "index.off-enhance-css.html", "index.off-enhance-js.html"]);
});

test("a plain demo stays live", () => {
  const plan = planExport({ demos: [demo([page()])] });
  assert.deepEqual(plan.posters, []);
  assert.deepEqual(plan.live, [{ route: "/demos/p/after", dir: "demos/p/after", documents: [{ flags: {}, file: "index.html" }] }]);
});

test("what a static host can't run falls back to a poster, with a reason", () => {
  const why = (d: Demo) => planExport({ demos: [d] }).posters[0]?.why;
  assert.match(why(demo([page({ kind: "server", route: "/@shop/a" })]))!, /server of its own/);
  assert.match(why(demo([page()], { routes: [{ method: "GET", path: "/a", handler: () => new Response() }] }))!, /server routes/);
  assert.match(why(demo([page({ route: "/orders" })]))!, /address/);
  assert.match(why(demo([page({ flags: { "csp-enforce": true } })]))!, /csp-enforce/);
  assert.match(why(demo([page({}, [[{ type: "toggle", flag: "csp-enforce", on: false }]])]))!, /csp-enforce/);
  assert.match(why(demo([page({ flags: { "enhance-js": true } }, [[], [{ type: "toggle", flag: "enhance-js", on: false }]], "a.html")]))!, /several documents/);
});

test("the CSP moves into a <meta>, first in the head, with what a <meta> can't hold left out", () => {
  const html = staticFrame('<!doctype html>\n<html>\n<head>\n<link rel="stylesheet" href="/a.css">', "default-src 'none'; frame-ancestors 'self'; report-uri /r; sandbox allow-scripts; base-uri 'none'");
  const [, rest] = html.split("<head>\n");
  assert.ok(rest.startsWith('<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; base-uri \'none\'">'));
  assert.ok(rest.indexOf("Content-Security-Policy") < rest.indexOf("<link"));
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
});

test("frameRefs finds a frame's own files and nothing else", () => {
  const html = '<link href="panel.css"><script src="./a.js?v=1"></script><img src="/demos/p/after/b.png"><a href="#x"></a><a href="https://example.com/c"></a><img src="data:image/png;base64,AAAA"><link href="/live-ish/frame-base.css">';
  assert.deepEqual(frameRefs(html, "/demos/p/after/index.html").sort(), ["/demos/p/after/a.js", "/demos/p/after/b.png", "/demos/p/after/panel.css"]);
  assert.deepEqual(frameRefs('a { background: url("img/c.png"); }', "/demos/p/after/panel.css"), ["/demos/p/after/img/c.png"]);
});

test("the manifest describes a deck with no content in it", () => {
  const assembled = {
    deck: { title: "A deck", event: undefined, links: { tag: { utm_source: "x" } } },
    slides: [{ id: "title", layout: "title", notes: "Private words" }],
    demos: [demo([page({ flags: { "enhance-css": true } })], { routes: [{ method: "GET", path: "/a", handler: () => new Response() }, { method: "GET", path: /^\/b/, handler: () => new Response() }] })],
  } as never;
  const manifest = deckManifest(assembled, [{ app: "shop", port: 4100 }]);
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.slides, [{ id: "title", layout: "title" }]);
  assert.deepEqual(manifest.pages[0].steps, ["s0"]);
  assert.equal(manifest.pages[0].frame?.kind, "web");
  assert.deepEqual(manifest.routes.addresses, ["/a"]);
  assert.deepEqual(manifest.linkTags, ["utm_source"]);
  assert.deepEqual(manifest.servers, [{ app: "shop", port: 4100 }]);
  assert.ok(!JSON.stringify(manifest).includes("Private words"));
});
