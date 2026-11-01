import assert from "node:assert/strict";
import { createServer } from "node:net";
import { test } from "node:test";
import { externalOrigins } from "../src/next/hosting.cjs";

// Inlined by `withDeck()` in a real build, and read when the module loads.
process.env.NEXT_PUBLIC_LIVE_ISH_EXTERNAL = JSON.stringify({ shop: "http://localhost:4100" });
const { externalOrigin, frameLive, frameQuery, frameUrl, offlineNote, serverApp } = await import("../src/lib/frames/origins");
const { serverAnswers } = await import("../src/lib/frames/server-up");

test("a server route names its app, and a deck's own route names none", () => {
  assert.equal(serverApp("/@shop/products/1"), "shop");
  assert.equal(serverApp("/@my-app"), "my-app");
  assert.equal(serverApp("/demos/faq/after"), null);
  assert.equal(externalOrigin("shop"), "http://localhost:4100");
  assert.equal(externalOrigin("other"), "");
});

test("a server frame opens the app's real path, with no index.html", () => {
  assert.deepEqual(frameUrl("/@shop/products/1/index.html"), { origin: "http://localhost:4100", url: "http://localhost:4100/products/1" });
  assert.equal(frameUrl("/@shop/index.html").url, "http://localhost:4100/");
  assert.equal(frameUrl("/@shop/styles.html").url, "http://localhost:4100/styles.html");
  assert.equal(frameUrl("/@shop").url, "http://localhost:4100/");
});

test("an app with no origin in this build is not live", () => {
  assert.equal(frameLive("/@shop/a"), true);
  assert.equal(frameLive("/@other/a"), false);
  assert.equal(frameLive("/demos/faq/after"), true);
});

test("a stopped app and an app this site leaves out get different neutral notes", () => {
  assert.match(offlineNote(true), /server is not running/);
  assert.match(offlineNote(), /its own app/);
  for (const note of [offlineNote(true), offlineNote()]) assert.ok(!/next\.?js/i.test(note));
});

test("externalOrigins normalizes, and a deployed build drops an app on this machine", () => {
  const hosts = { external: { shop: "http://localhost:4100/", lab: "http://127.0.0.1:4200", live: "https://shop.example.com/" } };
  assert.deepEqual(externalOrigins({ hosts, target: "local" }), { shop: "http://localhost:4100", lab: "http://127.0.0.1:4200", live: "https://shop.example.com" });
  assert.deepEqual(externalOrigins({ hosts, target: "deployed" }), { live: "https://shop.example.com" });
  assert.deepEqual(externalOrigins({ hosts: {}, target: "local" }), {});
  assert.throws(() => externalOrigins({ hosts: { external: { shop: "not a url" } }, target: "local" }), /hosts\.external\.shop must be an origin/);
});

test("a server frame's query names the deck and marks its first request", () => {
  const global = globalThis as unknown as { window?: unknown };
  global.window = { location: { origin: "http://localhost:3400" } };
  try {
    assert.equal(frameQuery("/@shop/a", undefined), "?presenter=http%3A%2F%2Flocalhost%3A3400&mount=1");
    assert.equal(frameQuery("/@shop/a", { "enhance-js": false }), "?flags=enhance-js:0&presenter=http%3A%2F%2Flocalhost%3A3400&mount=1");
    assert.equal(frameQuery("/@shop/a?x=1", undefined), "&presenter=http%3A%2F%2Flocalhost%3A3400&mount=1");
    assert.equal(frameQuery("/demos/faq/after", undefined), "");
  } finally {
    delete global.window;
  }
});

test("serverAnswers connects and sends nothing, and says no for a closed port", async () => {
  let bytes = 0;
  const server = createServer((socket) => socket.on("data", (d) => (bytes += d.length)));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  assert.equal(await serverAnswers(`http://127.0.0.1:${port}`), true);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(bytes, 0, "a log on the app must not see the probe");
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await serverAnswers(`http://127.0.0.1:${port}`), false);
});
