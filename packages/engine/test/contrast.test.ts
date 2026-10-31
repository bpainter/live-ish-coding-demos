import assert from "node:assert/strict";
import { test } from "node:test";
import { contrastReport, deckContrastReport, listThemes, resolveTheme, speakerContrastReport, type ContrastRow } from "../src/lib/chrome-themes";

const failing = (rows: ContrastRow[]) => rows.filter((r) => !r.pass).map((r) => `${r.pair}: ${r.ratio}:1, floor ${r.floor}:1`);

for (const { id } of listThemes()) {
  test(`contrast: ${id} clears every floor`, () => {
    const rows = contrastReport(resolveTheme(id));
    assert.deepEqual(failing(rows), []);
    // The strict highlight rule covers every syntax color, not plain ink alone.
    const band = rows.filter((r) => r.pair.endsWith("on a highlighted line"));
    assert.equal(band.length, 6);
    assert.ok(band.every((r) => r.floor === 7));
  });
}

test("contrast: the copy palette clears every floor", () => {
  assert.deepEqual(failing(deckContrastReport()), []);
});

test("contrast: the speaker palette clears the speaker view's floors", () => {
  const rows = speakerContrastReport();
  assert.deepEqual(failing(rows), []);
  assert.ok(rows.length > 40);
});

test("contrast: a failing theme.tokens value names the token and its ratio", () => {
  const rows = failing(deckContrastReport({ "--deck-ink": "#d8d3c6" }));
  assert.ok(rows.length > 0);
  assert.match(rows[0], /--deck-ink on --deck-paper: 1\.\d+:1, floor 7:1/);
});

test("contrast: the check catches a syntax color that fails only on the band", () => {
  const theme = structuredClone(resolveTheme("glass"));
  theme.code.string = "#6e6e6e";
  const rows = failing(contrastReport(theme));
  assert.ok(rows.some((r) => r.startsWith("Code string on a highlighted line")));
});
