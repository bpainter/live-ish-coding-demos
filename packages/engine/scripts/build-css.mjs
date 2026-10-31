#!/usr/bin/env node
// Compiles styles/app.css (with its @apply rules) to dist/engine.css, so a deck needs no Tailwind.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "styles", "app.css");
const to = path.join(root, "dist", "engine.css");

const result = await postcss([tailwind({ base: root, optimize: false })]).process(readFileSync(from, "utf8"), { from, to });
mkdirSync(path.dirname(to), { recursive: true });
writeFileSync(to, result.css);
console.log(`wrote dist/engine.css (${(result.css.length / 1024).toFixed(1)} KB)`);
