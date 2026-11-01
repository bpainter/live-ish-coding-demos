import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { bridgeScript, frameCsp, frameHeaders, frameSession, presenterOrigins, PROTOCOL_VERSION, runtimeTag, SESSION_COOKIE, SESSION_HEADER } from "../src/index.mjs";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

test("the protocol version matches the engine's, in the presenter and in the runtime", () => {
  const engine = /export const PROTOCOL_VERSION = (\d+);/.exec(read("../../engine/src/lib/engine/protocol.ts"));
  assert.ok(engine, "the engine exports PROTOCOL_VERSION");
  assert.equal(PROTOCOL_VERSION, Number(engine[1]));
  const runtime = /msg\.v = (\d+);/.exec(read("../../engine/assets/demo-runtime.js"));
  assert.ok(runtime, "the runtime stamps its messages");
  assert.equal(PROTOCOL_VERSION, Number(runtime[1]));
  assert.ok(bridgeScript().includes(`var PROTOCOL_VERSION = ${PROTOCOL_VERSION};`), "the browser half says the same");
});

test("presenterOrigins allows any local deck until an origin is named", () => {
  assert.deepEqual(presenterOrigins({}), ["http://localhost:*", "http://127.0.0.1:*"]);
  assert.deepEqual(presenterOrigins({ LIVE_ISH_PRESENTER_ORIGIN: "http://localhost:3400" }), ["http://localhost:3400"]);
  assert.deepEqual(presenterOrigins({ LIVE_ISH_PRESENTER_ORIGIN: "https://a.dev, https://b.dev" }), ["https://a.dev", "https://b.dev"]);
});

test("frameCsp names who may embed the app and where the runtime loads from", () => {
  assert.equal(frameCsp({ presenter: "http://localhost:3400" }), "frame-ancestors http://localhost:3400; script-src 'self' 'unsafe-inline' http://localhost:3400");
});

test("frameCsp takes a list, extra script sources and a dev switch", () => {
  const csp = frameCsp({ presenter: ["https://a.dev", "https://b.dev"], script: "https://cdn.dev", dev: true });
  assert.equal(csp, "frame-ancestors https://a.dev https://b.dev; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://a.dev https://b.dev https://cdn.dev");
});

test("frameCsp refuses a value that could add a directive", () => {
  assert.throws(() => frameCsp({ presenter: "http://localhost:3000; script-src *" }), /is not an origin/);
  assert.throws(() => frameCsp({ presenter: "*" }), /is not an origin/);
  assert.throws(() => frameCsp({ script: "https://cdn.dev\r\nX-Injected: 1" }), /is not an origin/);
});

test("frameHeaders adds what every Live-ish frame sends", () => {
  const headers = frameHeaders({ presenter: "https://a.dev" });
  assert.equal(headers["Referrer-Policy"], "no-referrer");
  assert.equal(headers["X-Robots-Tag"], "noindex, nofollow");
  assert.match(headers["Content-Security-Policy"], /^frame-ancestors https:\/\/a\.dev;/);
});

test("runtimeTag escapes the address", () => {
  assert.equal(runtimeTag(), '<script src="/live-ish-bridge.js"></script>');
  assert.equal(runtimeTag('/a"b.js'), '<script src="/a&quot;b.js"></script>');
});

test("frameSession reads the query, then the cookie, then the header", () => {
  const node = (url, headers = {}) => ({ url, headers });
  assert.equal(frameSession(node("/a?s=query", { cookie: `${SESSION_COOKIE}=cookie`, [SESSION_HEADER]: "header" })), "query");
  assert.equal(frameSession(node("/a", { cookie: `other=1; ${SESSION_COOKIE}=cookie`, [SESSION_HEADER]: "header" })), "cookie");
  assert.equal(frameSession(node("/a", { [SESSION_HEADER]: "header" })), "header");
  assert.equal(frameSession(node("/a")), "");
});

test("frameSession takes a fetch Request too", () => {
  const request = new Request("http://app.test/a", { headers: { cookie: `${SESSION_COOKIE}=cookie` } });
  assert.equal(frameSession(request), "cookie");
  assert.equal(frameSession(new Request("http://app.test/a", { headers: { [SESSION_HEADER]: "header" } })), "header");
});

test("a frame's first request belongs to no session, whatever it carries", () => {
  assert.equal(frameSession({ url: "/a?mount=1&s=query", headers: { cookie: `${SESSION_COOKIE}=cookie` } }), "");
});

test("frameSession drops a value that is not an id", () => {
  assert.equal(frameSession({ url: "/a?s=../../etc", headers: {} }), "");
  assert.equal(frameSession({ url: `/a?s=${"x".repeat(65)}`, headers: {} }), "");
  assert.equal(frameSession({ url: "/a", headers: { cookie: `${SESSION_COOKIE}=%E0%A4%A` } }), "");
});

/** Runs the browser half against just enough of a window. */
function browser(href, { parent } = {}) {
  const appended = [];
  const listeners = {};
  const attributes = {};
  const store = new Map();
  const window = {
    name: "",
    addEventListener: (type, fn) => {
      (listeners[type] ??= []).push(fn);
    },
  };
  window.parent = parent ?? window;
  const location = {
    href,
    replaced: null,
    replace(next) {
      this.replaced = next;
    },
  };
  const document = {
    cookie: "",
    currentScript: null,
    documentElement: { setAttribute: (k, v) => (attributes[k] = v) },
    head: { appendChild: (el) => appended.push(el) },
    createElement: () => ({}),
    addEventListener: () => undefined,
  };
  const history = { state: null, replaceState: (_s, _t, next) => (location.href = next) };
  const sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const errors = [];
  vm.runInNewContext(bridgeScript(), { window, location, document, history, sessionStorage, URL, Promise, Date, Math, Object, console: { error: (m) => errors.push(m) } });
  return { window, location, appended, attributes, document, listeners, errors, store };
}

test("on its own, the client loads no runtime and still registers hooks", () => {
  const page = browser("http://shop.test/a");
  assert.equal(page.appended.length, 0);
  page.window.liveIsh.hooks({ reset() {} });
  assert.equal(typeof page.window.demoHooks.reset, "function");
  assert.equal(page.window.liveIsh.embedded, false);
});

test("embedded, the client adds the meta and the runtime, and cleans the address", () => {
  const page = browser("http://shop.test/a?presenter=http%3A%2F%2Flocalhost%3A3400&mount=1&s=abc&flags=enhance-js:0&x=1", { parent: {} });
  assert.deepEqual(
    page.appended.map((el) => el.content ?? el.src),
    ["http://localhost:3400", "http://localhost:3400/live-ish/demo-runtime.js"],
  );
  assert.equal(page.location.href, "http://shop.test/a?flags=enhance-js%3A0&x=1");
  assert.equal(page.attributes["data-flags"], "enhance-js:0");
  assert.equal(page.attributes["data-pages"], "");
});

test("a later document in the frame still finds the deck", () => {
  const first = browser("http://shop.test/a?presenter=http%3A%2F%2Flocalhost%3A3400", { parent: {} });
  assert.equal(first.store.get("live-ish:presenter"), "http://localhost:3400");
});

test("a session stays in window.name, and the runtime's count is not one", () => {
  const page = browser("http://shop.test/a");
  page.window.name = '{"index":1,"max":1}';
  assert.equal(page.window.liveIsh.session(), "");
  const id = page.window.liveIsh.startSession();
  assert.equal(page.window.name, id);
  assert.ok(page.document.cookie.startsWith(`${SESSION_COOKIE}=${id}`));
  assert.equal(page.window.liveIsh.withSession("/b"), `http://shop.test/b?s=${id}`);
});

test("load replaces the document, so history.length stays put", () => {
  const page = browser("http://shop.test/a");
  page.window.name = "abc";
  void page.window.liveIsh.load("/b");
  assert.equal(page.location.replaced, "http://shop.test/b?s=abc");
  assert.equal(page.attributes["data-unloading"], "");
});

test("a deck on another protocol version gets one clear line in the frame's console", () => {
  const parent = {};
  const page = browser("http://shop.test/a?presenter=http%3A%2F%2Flocalhost%3A3400", { parent });
  const send = page.listeners.message[0];
  send({ source: parent, origin: "http://localhost:3400", data: { v: PROTOCOL_VERSION } });
  send({ source: parent, origin: "http://elsewhere.test", data: { v: 9 } });
  assert.equal(page.errors.length, 0);
  send({ source: parent, origin: "http://localhost:3400", data: { v: 9 } });
  send({ source: parent, origin: "http://localhost:3400", data: { v: 9 } });
  assert.equal(page.errors.length, 1);
  assert.match(page.errors[0], /protocol v9/);
});
