import assert from "node:assert/strict";
import { test } from "node:test";
import { compareReports, digestOf, outcomeOf, readMatrix, type Matrix, type Report, type RowResult } from "./report";
import { routes } from "./routes";
import { frames } from "./frames";
import { presenter } from "./presenter";
import { seo } from "./seo";
import { framesOriginOf, metaOf, titleOf } from "./target";

const matrix: Matrix = {
  rows: [
    { id: "RT-1", capability: "", check: "", suite: "routes" },
    { id: "RD-11", capability: "", check: "", suite: null, exception: "E-4" },
    { id: "SE-1", capability: "", check: "", suite: "seo" },
  ],
  exceptions: [{ id: "E-4", rows: ["RD-11"], status: "approved-pending-owner" }],
};

const pass = (facts = { a: true }, digest = "same"): RowResult => ({ suite: "routes", outcome: "pass", facts, digest });
const report = (target: string, rows: Report["rows"]): Report => ({ version: 1, target, build: "x", rows });
const full = (target: string, over: Report["rows"] = {}) => report(target, { "RT-1": pass(), "RD-11": pass(), "SE-1": pass(), ...over });

test("two matching reports compare clean", () => {
  const result = compareReports(full("a"), full("b"), matrix);
  assert.equal(result.ok, true);
  assert.deepEqual(result.differences, []);
});

test("a row that differs fails, unless the exceptions list it", () => {
  const failed: RowResult = { suite: "routes", outcome: "fail", facts: { a: false } };
  const listed = compareReports(full("a"), full("b", { "RD-11": failed }), matrix);
  assert.equal(listed.ok, true);
  assert.equal(listed.differences[0].exception, "E-4");
  const unlisted = compareReports(full("a"), full("b", { "RT-1": failed }), matrix);
  assert.equal(unlisted.ok, false);
  assert.equal(unlisted.unlisted[0].id, "RT-1");
});

test("the same outcome with different facts differs", () => {
  const result = compareReports(full("a"), full("b", { "RT-1": pass({ a: true, b: true } as never) }), matrix);
  assert.equal(result.ok, false);
  assert.match(result.unlisted[0].reason, /^facts/);
});

test("a row checked on one target only differs: n/a is not a pass", () => {
  const result = compareReports(full("a"), full("b", { "SE-1": { suite: "seo", outcome: "n/a", facts: {} } }), matrix);
  assert.equal(result.ok, false);
  assert.match(result.unlisted[0].reason, /^outcome/);
});

test("a row missing from a report differs", () => {
  const { "SE-1": _gone, ...rows } = full("b").rows;
  const result = compareReports(full("a"), report("b", rows), matrix);
  assert.equal(result.ok, false);
  assert.match(result.unlisted[0].reason, /missing from the second/);
});

test("digests compare within a target and never across", () => {
  const other = full("a", { "RT-1": pass({ a: true }, "changed") });
  assert.equal(compareReports(full("a"), other, matrix).ok, false);
  const across = full("b", { "RT-1": pass({ a: true }, "changed") });
  assert.equal(compareReports(full("a"), across, matrix).ok, true);
});

test("facts decide the outcome, and only a false one fails", () => {
  assert.equal(outcomeOf({ a: true, count: 0, label: "x" }), "pass");
  assert.equal(outcomeOf({ a: true, b: false }), "fail");
});

test("a digest is stable, and changes with what it saw", () => {
  assert.equal(digestOf(["a"]), digestOf(["a"]));
  assert.notEqual(digestOf(["a"]), digestOf(["b"]));
});

test("every row the matrix gives a suite has a check, and no check lacks a row", () => {
  const suites: Record<string, Record<string, unknown>> = { routes, frames, presenter, seo };
  const real = readMatrix();
  for (const row of real.rows.filter((r) => r.suite)) assert.ok(suites[row.suite!][row.id], `${row.id} has no check in ${row.suite}`);
  for (const [name, checks] of Object.entries(suites)) {
    for (const id of Object.keys(checks)) assert.equal(real.rows.find((r) => r.id === id)?.suite, name, `${id} is not a ${name} row`);
  }
});

test("the frames origin is the other local address", () => {
  assert.equal(framesOriginOf("http://localhost:3400"), "http://127.0.0.1:3400");
  assert.equal(framesOriginOf("http://127.0.0.1:3400"), "http://localhost:3400");
  assert.equal(framesOriginOf("https://talk.example.com"), "https://talk.example.com");
});

test("titleOf and metaOf read a document's head", () => {
  const html = '<title>A</title><meta name="robots" content="noindex"><meta property="og:title" content="B">';
  assert.equal(titleOf(html), "A");
  assert.equal(metaOf(html, "robots"), "noindex");
  assert.equal(metaOf(html, "og:title"), "B");
  assert.equal(metaOf(html, "description"), "");
});
