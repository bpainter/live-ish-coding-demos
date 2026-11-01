import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli";
import { UsageError, parseArgs } from "../src/lib/args";
import { budgets } from "../src/lib/budgets";
import { loadDeck, warmedIntros } from "../src/lib/deck";
import { meanDifference } from "../src/lib/pixels";
import { Report } from "../src/lib/report";
import { chromiumArgs, framesOriginFor, originPair } from "../src/lib/session";
import { median, pct } from "../src/lib/stats";
import { checkDistinct } from "../src/walk/deck";
import { modeAndId } from "../src/walk";
import { merged } from "../src/walk/spotlight";
import { arrivalPlan, windowStats, type Arrival, type Leg } from "../src/walk/underlay";
import { shownSelectors } from "../src/walk/wrapper";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STARTER = path.join(HERE, "..", "..", "..", "examples", "starter");
const SRC = path.join(HERE, "..", "src");

test("parseArgs takes both forms of a value, and a value may start with dashes", () => {
  const a = parseArgs(["faq", "--mode=keys", "--without", "--enable-blink-features=Lanes", "--headed"], { values: ["mode", "without"], flags: ["headed"] });
  assert.deepEqual(a.words, ["faq"]);
  assert.equal(a.opt("mode"), "keys");
  assert.deepEqual(a.all("without"), ["--enable-blink-features=Lanes"]);
  assert.equal(a.flag("headed"), true);
});

test("parseArgs refuses an option it does not know", () => {
  assert.throws(() => parseArgs(["--nope"], { flags: ["json"] }), UsageError);
});

test("a mode comes from --mode or the first word, and anything else is an id", () => {
  assert.deepEqual(modeAndId(["underlay", "faq"], undefined), { mode: "underlay", id: "faq" });
  assert.deepEqual(modeAndId(["faq"], "advance"), { mode: "advance", id: "faq" });
  assert.deepEqual(modeAndId(["faq"], undefined), { mode: undefined, id: "faq" });
  assert.throws(() => modeAndId([], "nope"), UsageError);
});

test("run returns the public exit codes", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(await run(["nope"], { root: STARTER, engineVersion: "0.0.0" }), 2);
    assert.equal(await run(["walk", "--nope"], { root: STARTER, engineVersion: "0.0.0" }), 2);
    assert.equal(await run(["walk", "--origin=http://127.0.0.1:9"], { root: STARTER, engineVersion: "0.0.0" }), 3);
  } finally {
    console.error = quiet;
  }
});

test("the walks read a deck, and name no slide of one", async () => {
  const deck = await loadDeck(STARTER);
  assert.equal(deck.ids[0], "title");
  assert.equal(deck.stateKey, "live-ish:show-the-code-and-the-result:state");
  assert.deepEqual(warmedIntros(deck), [{ prev: "what-this-shows", intro: "faq-intro", next: "faq-before" }]);
  // Generic checks: nothing in src/ may name a page, demo or step of the starter.
  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts"));
  for (const f of files) {
    const text = readFileSync(path.join(SRC, f), "utf8");
    for (const id of deck.ids) if (id.includes("-")) assert.ok(!text.includes(`"${id}"`), `${f} names ${id}`);
  }
});

test("a small deck's arrivals repeat until a window has its minimum", () => {
  const leg = (i: number) => ({ dir: "forward", from: `p${i}`, key: "x", step: 0, page: {} }) as unknown as Leg;
  assert.equal(arrivalPlan([leg(1), leg(2), leg(3)], 50).length, 51);
  assert.equal(arrivalPlan([leg(1)], 0).length, 1);
  assert.equal(arrivalPlan([], 50).length, 0);
  assert.equal(budgets.underlay.minArrivalsPerWindow, 50);
});

test("windowStats takes nearest-rank p90 and counts a frame that never showed as 1500 ms", () => {
  const arrival = (ms: number) => ({ ms, stage: ms }) as Arrival;
  const s = windowStats(Array.from({ length: 10 }, (_, i) => arrival(i === 9 ? -1 : (i + 1) * 10)));
  assert.equal(s.p90, 90);
  assert.equal(s.median, 50);
  assert.equal(pct([1, 2, 3, 4], 50), 2);
  assert.equal(median([3, 1, 2, 4]), 2);
});

test("no budget in the reference table was loosened", () => {
  assert.equal(budgets.underlay.audienceP90Ms.limit, 100);
  assert.equal(budgets.underlay.readerP90Ms.limit, 250);
  assert.equal(budgets.underlay.loadingWithPoster.limit, 0);
  assert.equal(budgets.underlay.posterSwap.limit, 0.02);
  assert.equal(budgets.focus.lostPresses.limit, 0);
  assert.equal(budgets.reference.profile, "venue");
});

test("chromiumArgs drops a switch named by --without and keeps the rest", () => {
  const args = chromiumArgs(["--a", "--b"], ["--a"]);
  assert.ok(!args.includes("--a"));
  assert.ok(args.includes("--b"));
  assert.ok(chromiumArgs([], [], true).includes("--disable-site-isolation-trials"));
});

test("the two local origins pair up, and another host has no pair", () => {
  assert.deepEqual(originPair("http://localhost:3462"), ["http://localhost:3462", "http://127.0.0.1:3462"]);
  assert.deepEqual(originPair("https://example.com"), ["https://example.com"]);
  assert.equal(framesOriginFor("https://example.com", "https://frames.example.com/"), "https://frames.example.com");
});

test("merged joins rects within 12 px and clips at the drawer", () => {
  assert.equal(merged([{ x: 0, y: 0, w: 10, h: 10 }, { x: 15, y: 0, w: 10, h: 10 }], 100, 100).length, 1);
  assert.equal(merged([{ x: 0, y: 0, w: 10, h: 10 }, { x: 40, y: 0, w: 10, h: 10 }], 100, 100).length, 2);
  assert.equal(merged([{ x: 20, y: 300, w: 100, h: 400 }], 640, 628, 508)[0].h, 208);
});

test("shownSelectors drops pseudo-classes and keeps what can match", () => {
  const sel = shownSelectors([{ lang: "css", source: ".a:hover, .b::before { color: red; } @media (min-width: 1px) { .c { margin: 0; } } /* .d { } */" }]);
  assert.deepEqual(sel.sort(), [".a", ".b", ".c"]);
});

test("meanDifference reads images with different channel counts", () => {
  const a = { data: Buffer.from([0, 0, 0]), info: { width: 1, height: 1, channels: 3 } };
  const b = { data: Buffer.from([255, 255, 255, 255]), info: { width: 1, height: 1, channels: 4 } };
  assert.equal(meanDifference(a, b), 1);
});

test("--json keeps stdout to one document with a version", () => {
  const lines: string[] = [];
  const out = console.log;
  const err = console.error;
  console.log = (l: string) => lines.push(l);
  console.error = () => {};
  try {
    const r = new Report("walk", true);
    r.pass("one");
    r.fail("two", "wrong");
    assert.equal(r.finish("walk"), 1);
  } finally {
    console.log = out;
    console.error = err;
  }
  assert.equal(lines.length, 1);
  const doc = JSON.parse(lines[0]) as { version: number; ok: boolean; checks: number };
  assert.equal(doc.version, 1);
  assert.equal(doc.ok, false);
  assert.equal(doc.checks, 1);
});

test("checkDistinct fails two backgrounds that look alike", () => {
  const thumb = Array.from({ length: 144 }, () => [10, 10, 10]);
  const calls: string[] = [];
  checkDistinct({ a: { thumb }, b: { thumb } }, { pass: () => calls.push("pass"), fail: () => calls.push("fail") });
  assert.deepEqual(calls, ["fail"]);
});
