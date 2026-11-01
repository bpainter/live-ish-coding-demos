#!/usr/bin/env node
// Renders parity/matrix.json into the docs. `matrix.test.mjs` fails when the two disagree.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (file) => fileURLToPath(new URL(file, import.meta.url));
export const OUTPUT = here("../docs/generated/parity-matrix.md");

const GROUPS = {
  routes: "Routes",
  keys: "Keys",
  presenter: "Presenter behaviors",
  actions: "Demo engine actions",
  engine: "Demo engine behaviors",
  frames: "Frames",
  reader: "Reader view",
  seo: "SEO and sharing",
  validators: "Validators",
  walks: "Walks and accessibility checks",
  capture: "Capture and generated assets",
  warmup: "Warm-up",
  perf: "Perf and budgets",
  tooling: "Other tooling",
};

/** A cell can't hold a pipe or a line break. */
const cell = (value) => String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");

export function render(matrix) {
  const out = ["# Parity matrix", "", "Generated from `parity/matrix.json` by `parity/render.mjs`. Do not edit.", ""];
  const sign = matrix.rows.filter((r) => r.suite).length;
  out.push(`${matrix.rows.length} capabilities, ${sign} of them proved by \`live-ish parity\`. Every other row names the tool that proves it.`, "");
  for (const [group, title] of Object.entries(GROUPS)) {
    out.push(`## ${title}`, "", "| ID | Capability | Target | Phase | Proving check |", "|---|---|---|---|---|");
    for (const r of matrix.rows.filter((row) => row.group === group)) out.push(`| ${r.id} | ${cell(r.capability)} | ${cell(r.target)} | ${r.phase} | ${cell(r.check)} |`);
    out.push("");
  }
  out.push(
    "## Exceptions",
    "",
    "An exception is a deliberate gap or a default that differs from what a row might suggest. `approved-pending-owner` means the recommendation is the default until the repository owner signs the table below.",
    "",
    "| ID | Exception | Kind | Reason | Recommendation | Status | Rows |",
    "|---|---|---|---|---|---|---|",
  );
  for (const e of matrix.exceptions) out.push(`| ${e.id} | ${cell(e.exception)} | ${e.kind} | ${cell(e.reason)} | ${cell(e.recommendation)} | ${e.status} | ${e.rows.join(", ")} |`);
  out.push("", "## Sign-off", "", "For the repository owner. Left blank on purpose.", "", "| Exception | Decision | Date |", "|---|---|---|");
  for (const e of matrix.exceptions) out.push(`| ${e.id} | | |`);
  return `${out.join("\n")}\n`;
}

export const readMatrix = () => JSON.parse(readFileSync(here("./matrix.json"), "utf8"));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(OUTPUT, render(readMatrix()));
  console.log(`Wrote ${OUTPUT}`);
}
