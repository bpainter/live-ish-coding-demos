import assert from "node:assert/strict";
import { test } from "node:test";
import { computeSupport, webFeaturesEntry, type WebFeaturesData } from "../src/lib/support-data";
import { installedWebFeatures } from "../src/lib/web-features";
import type { Demo, SupportSource } from "../src/schema/demo";

/** Support data against the installed `web-features`: versions, dates and the generated sentences. */

const wf = installedWebFeatures();

const demo = (id: string, support: SupportSource) => ({ id, support, pages: [{ beat: "intro" }] }) as unknown as Demo;

const WEB = (id: string, extra: object = {}): SupportSource => ({ kind: "web-features", id, ...extra });

/** Feature, tile versions in browser order, and the Baseline low date. */
const TABLE: [string, (string | null)[], string | null][] = [
  ["dialog", ["37", "79", "98", "15.4"], "2022-03-14"],
  ["container-queries", ["105", "105", "110", "16"], "2023-02-14"],
  ["trusted-types", ["83", "83", "148", "26"], "2026-02-24"],
];

for (const [feature, versions, low] of TABLE) {
  test(`${feature}: tiles and the Baseline date come from the data`, () => {
    const e = computeSupport([demo("d", WEB(feature))], wf.data, wf.version, {}).demos.d;
    assert.equal(e.id, feature);
    assert.deepEqual(e.tiles.map((t) => t.version), versions);
    assert.equal(e.baselineLowDate ?? null, low);
  });
}

test("alsoUses reads as a sentence with each feature's date", () => {
  const e = computeSupport([demo("d", WEB("dialog", { alsoUses: ["popover"] }))], wf.data, wf.version, {}).demos.d;
  assert.equal(e.alsoUses, "This demo also uses Popover (January 2025).");
});

test("a demo with no intro page is left out of the file", () => {
  const out = computeSupport([{ id: "d", support: WEB("dialog"), pages: [] } as unknown as Demo], wf.data, wf.version, {});
  assert.deepEqual(out.demos, {});
});

/** `compatKeys` on a fixed fixture, apart from the installed data. */
const FIXTURE: WebFeaturesData = {
  browsers: {
    chrome: { name: "Chrome", releases: [{ version: "125", date: "2024-05-14" }, { version: "129", date: "2024-09-17" }] },
    edge: { name: "Edge", releases: [{ version: "125", date: "2024-05-17" }, { version: "129", date: "2024-09-19" }] },
    firefox: { name: "Firefox", releases: [{ version: "147", date: "2026-01-13" }] },
    safari: { name: "Safari", releases: [{ version: "26", date: "2025-09-15" }, { version: "26.2", date: "2025-12-12" }] },
  },
  features: {
    demo: {
      name: "Demo feature",
      status: {
        baseline: false,
        support: { safari: "27" },
        by_compat_key: {
          "css.a": { baseline: "low", baseline_low_date: "2025-09-15", support: { chrome: "125", edge: "125", firefox: "147", safari: "26.2" } },
          "css.b": { baseline: "low", baseline_low_date: "2026-01-13", support: { chrome: "129", edge: "129", firefox: "147", safari: "26" } },
          "css.c": { baseline: false, support: { chrome: "129", edge: "129", safari: "26" } },
        },
      },
    },
  },
};

test("compatKeys take the highest version per browser and the latest low date", () => {
  const e = webFeaturesEntry(FIXTURE, { kind: "web-features", id: "demo", compatKeys: ["css.a", "css.b"] });
  assert.deepEqual(e.tiles.map((t) => t.version), ["129", "129", "147", "26.2"]);
  assert.equal(e.since, "It has been available in all four browsers since January 2026.");
});

test("a browser missing from one key is Not yet, and the set is not Baseline", () => {
  const e = webFeaturesEntry(FIXTURE, { kind: "web-features", id: "demo", compatKeys: ["css.a", "css.b", "css.c"], fallback: { missing: ["firefox"], text: "a fallback" } });
  assert.equal(e.tiles[2].version, null);
  assert.equal(e.baseline, false);
  assert.match(e.since, /Firefox shows a fallback\.$/);
});

test("a feature missing a browser and no fallback fails in words", () => {
  assert.throws(() => webFeaturesEntry(FIXTURE, { kind: "web-features", id: "demo", compatKeys: ["css.c"] }), /support\.fallback is not set/);
  assert.throws(() => webFeaturesEntry(FIXTURE, { kind: "web-features", id: "nope" }), /no feature "nope"/);
});
