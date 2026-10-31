import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Rect } from "../src/lib/engine/protocol";
import { FADE_IN_MS, FADE_OUT_MS, MAX_HOLD_MS, SETTLE_MS, SpotlightGate } from "../src/lib/engine/settle";

/** The spotlight gate, on a fake clock with scripted rect streams. */

const box = (x: number, w = 100, r = 8): Rect => ({ x, y: 10, w, h: 40, radii: [r, r, r, r] });

function harness() {
  const clock = { t: 0 };
  const gate = new SpotlightGate<string>(() => clock.t);
  gate.setReady(true);
  /** Advances the clock, evaluating every 4 ms like a timer would. Returns the first time shown. */
  const run = (until: number) => {
    let first: number | null = null;
    while (clock.t < until) {
      clock.t += 4;
      if (gate.view().shown && first === null) first = clock.t;
    }
    return first;
  };
  return { clock, gate, run };
}

const within = (at: number | null, from: number) => assert.ok(at !== null && at - from >= SETTLE_MS && at - from <= SETTLE_MS + 8, String(at));

test("the constants hold", () => {
  assert.deepEqual([SETTLE_MS, FADE_OUT_MS, FADE_IN_MS, MAX_HOLD_MS], [120, 100, 160, 2000]);
});

test("a move hides at once and shows 120 ms after the last change, at the latest geometry", () => {
  const { clock, gate, run } = harness();
  gate.update("a", [box(0)], false);
  within(run(200), 0);
  clock.t = 1000;
  gate.update("b", [box(10)], false);
  const v = gate.view();
  assert.equal(v.shown, false);
  assert.equal(v.payload, "a", "a hidden box keeps its last geometry");
  within(run(1200), 1000);
  assert.equal(gate.view().payload, "b");
});

test("changes under epsilon do not count", () => {
  const { gate, run } = harness();
  gate.update("a", [box(0)], false);
  run(200);
  gate.update("a2", [box(0.3)], false);
  assert.ok(gate.view().shown);
});

test("repeated moves stay hidden until 120 ms after the last one", () => {
  const { clock, gate, run } = harness();
  gate.update("a", [box(0)], false);
  run(200);
  for (let i = 1; i <= 10; i++) {
    clock.t = 200 + i * 50;
    gate.update(`m${i}`, [box(i * 5)], false);
    assert.equal(gate.view().shown, false, `move ${i}`);
  }
  const last = clock.t;
  within(run(last + 300), last);
});

test("a count change is movement", () => {
  const { gate, run } = harness();
  gate.update("a", [box(0)], false);
  run(200);
  gate.update("b", [box(0), box(200)], false);
  assert.equal(gate.view().shown, false);
});

test("animating holds the boxes hidden with unchanged rects", () => {
  const { clock, gate, run } = harness();
  gate.update("a", [box(0)], false);
  run(200);
  gate.update("a", [box(0)], true);
  assert.equal(gate.view().shown, false);
  assert.equal(run(800), null);
  gate.update("a", [box(0)], false);
  const end = clock.t;
  within(run(end + 300), end);
});

test("movement during a fade-in hides again, and the next settle shows", () => {
  const { clock, gate, run } = harness();
  gate.update("a", [box(0)], false);
  const first = run(200)!;
  clock.t = first + 40; // inside the 160 ms fade-in
  gate.update("b", [box(30)], false);
  assert.equal(gate.view().shown, false);
  assert.notEqual(run(clock.t + 300), null);
  assert.equal(gate.view().payload, "b");
});

test("rects that never settle show at the latest geometry after 2000 ms, once", () => {
  const { clock, gate } = harness();
  let forcedAt: number | null = null;
  let forcedCount = 0;
  let i = 0;
  while (clock.t < 3000) {
    clock.t += 4;
    if (clock.t % 40 === 0) gate.update(`x${++i}`, [box(i)], false);
    if (gate.view().forced) {
      forcedCount++;
      forcedAt = clock.t;
    }
  }
  assert.ok(forcedAt !== null && forcedAt >= MAX_HOLD_MS && forcedAt <= MAX_HOLD_MS + 8, String(forcedAt));
  assert.equal(forcedCount, 1);
  assert.ok(gate.view().shown);
  assert.equal(gate.view().payload, `x${i}`);
});

test("a new step waits for step-done, then shows at the first settle after it", () => {
  const { clock, gate, run } = harness();
  gate.update("a", [box(0)], false);
  run(200);
  gate.reset();
  gate.setReady(false);
  assert.equal(gate.view().shown, false);
  gate.update("s1", [box(50)], false);
  assert.equal(run(1500), null);
  gate.setReady(true);
  assert.ok(gate.view().shown);
  assert.equal(gate.view().payload, "s1");
  // Moving at step-done: the boxes wait for the settle after it.
  gate.reset();
  gate.setReady(false);
  clock.t = 2000;
  gate.update("s2", [box(80)], false);
  clock.t = 2050;
  gate.setReady(true);
  gate.update("s2b", [box(90)], false);
  const end = clock.t;
  const shownAt = run(end + 300);
  assert.ok(shownAt !== null && shownAt - end >= SETTLE_MS, String(shownAt));
});

test("no fail-safe while a step plays", () => {
  const { clock, gate } = harness();
  gate.setReady(false);
  for (let k = 0; k < 900; k++) {
    clock.t += 4;
    gate.update(`p${k}`, [box(k)], false);
    assert.equal(gate.view().forced, false);
  }
});

test("a viewport resize is movement before any rect changes", () => {
  const { gate, run } = harness();
  gate.update("a", [box(0)], false);
  run(200);
  gate.disturb();
  assert.equal(gate.view().shown, false);
  const shownAt = run(500);
  assert.ok(shownAt !== null && shownAt - 200 >= SETTLE_MS, String(shownAt));
});

test("reduced motion drops the opacity transition, and only opacity transitions", () => {
  const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "styles", "components", "page.css"), "utf8");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.overlay__spotlight,\s*\.overlay__focus,\s*\.overlay__callout\s*\{\s*transition: none;/);
  assert.doesNotMatch(css, /\.overlay__spotlight[^{]*\{[^}]*transition:[^;}]*(left|top|width|height|transform)/);
});
