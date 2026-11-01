// The matching behind scan:private. It compares salted hashes, so the term list cannot be read back
// from this repo, and a finding names a hash prefix rather than the term it hit.
//
// A term is lowercased and split into words on anything that is not a letter, a mark or a digit, then
// the words are joined with one space and hashed. A file goes through the same steps. That is what
// lets one entry catch `a b`, `a-b` and a pair split over two lines.
//
// Every substring hit the old plain-text check would have made is still a hit. The first word of a
// term may end a longer word and the last may start one, while the words between stand alone,
// because those are exactly the shapes a substring can take.
import { hash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const WORD = /[\p{L}\p{M}\p{N}]+/gu;
const NONE = Object.freeze([]);
export const PREFIX = 8;

/** Lowercased words joined by one space: the form of a term that gets hashed. */
export const normalize = (term) => (term.toLowerCase().match(WORD) ?? []).join(" ");

/** 64 bits is enough to keep an accidental hit out of a few million comparisons. */
export const digest = (normalized, salt) => hash("sha256", `${salt}\n${normalized}`, "hex").slice(0, 16);

/** A term's word lengths. The scan hashes only candidates of a listed shape. */
export const shapeOf = (normalized) =>
  normalized
    .split(" ")
    .map((word) => word.length)
    .join(",");

/** Reads the `salt`, `shape`, `term` and `owner` lines. An `owner` line is a term with the exemption. */
export function parseList(text) {
  const list = { salt: "", shapes: [], hashes: new Set(), owner: new Set() };
  for (const line of text.split("\n")) {
    const [kind, value] = line.trim().split(" ");
    if (kind === "salt") list.salt = value;
    if (kind === "shape") list.shapes.push(value);
    if (kind === "term" || kind === "owner") list.hashes.add(value);
    if (kind === "owner") list.owner.add(value);
  }
  if (!list.salt) throw new Error("The term list has no salt.");
  return list;
}

/** Sorted, so a hash cannot be paired with the shape of the term behind it. */
export function renderList(list, header) {
  const lines = [...header, `salt ${list.salt}`];
  for (const shape of [...new Set(list.shapes)].sort()) lines.push(`shape ${shape}`);
  for (const value of [...list.hashes].sort()) lines.push(`${list.owner.has(value) ? "owner" : "term"} ${value}`);
  return `${lines.join("\n")}\n`;
}

/** Adds terms to a list in place. Duplicates after normalizing collapse to one entry. */
export function addTerms(list, terms) {
  for (const term of terms) {
    const normalized = normalize(term);
    if (!normalized) continue;
    list.hashes.add(digest(normalized, list.salt));
    list.shapes.push(shapeOf(normalized));
  }
  return list;
}

/** Returns `find(text)`, which lists every hit as `{ hash, start, end }`. Give it lowercased text. */
export function createMatcher({ salt, hashes, shapes }) {
  const parsed = [...new Set(shapes)].map((shape) => shape.split(",").map(Number));
  const singles = parsed.filter((shape) => shape.length === 1).map(([length]) => length);
  const grams = [...new Set(parsed.map((shape) => shape.length))]
    .filter((size) => size > 1)
    .map((size) => {
      const group = parsed.filter((shape) => shape.length === size);
      return {
        size,
        group,
        first: Math.min(...group.map((shape) => shape[0])),
        last: Math.min(...group.map((shape) => shape[size - 1])),
        middle: new Set(group.flatMap((shape) => shape.slice(1, -1))),
      };
    });

  const check = (candidate) => {
    const value = digest(candidate, salt);
    return hashes.has(value) ? value : "";
  };

  // Files share most of their words and word runs, so each unique one is worked out once.
  const wordHits = new Map();
  const inWord = (word) => {
    let hits = wordHits.get(word);
    if (hits) return hits;
    hits = NONE;
    for (const length of singles) {
      for (let at = 0; at + length <= word.length; at++) {
        const value = check(word.slice(at, at + length));
        if (value) hits = [...hits, { hash: value, at, length }];
      }
    }
    wordHits.set(word, hits);
    return hits;
  };

  const runHits = new Map();
  const inRun = (words, from, { size, group }) => {
    const first = words[from];
    const last = words[from + size - 1];
    let key = first;
    for (let i = 1; i < size; i++) key += ` ${words[from + i]}`;
    let hits = runHits.get(key);
    if (hits) return hits;
    hits = NONE;
    const between = key.slice(first.length, key.length - last.length);
    for (const shape of group) {
      const head = shape[0];
      const tail = shape[size - 1];
      if (first.length < head || last.length < tail) continue;
      let fits = true;
      for (let i = 1; i < size - 1 && fits; i++) fits = words[from + i].length === shape[i];
      if (!fits) continue;
      const value = check(first.slice(first.length - head) + between + last.slice(0, tail));
      if (value) hits = [...hits, { hash: value, head, tail }];
    }
    runHits.set(key, hits);
    return hits;
  };

  return function find(text) {
    const words = [];
    const starts = [];
    for (const match of text.matchAll(WORD)) {
      words.push(match[0]);
      starts.push(match.index);
    }
    const found = [];
    for (let i = 0; i < words.length; i++) {
      for (const hit of inWord(words[i])) found.push({ hash: hit.hash, start: starts[i] + hit.at, end: starts[i] + hit.at + hit.length });
      for (const gram of grams) {
        const end = i + gram.size - 1;
        if (end >= words.length || words[i].length < gram.first || words[end].length < gram.last) continue;
        let plausible = true;
        for (let j = i + 1; j < end && plausible; j++) plausible = gram.middle.has(words[j].length);
        if (!plausible) continue;
        for (const hit of inRun(words, i, gram)) found.push({ hash: hit.hash, start: starts[i] + words[i].length - hit.head, end: starts[end] + hit.tail });
      }
    }
    return found;
  };
}

/** Compiles one line of binary-allow.txt. `**` spans folders. */
export const allowGlob = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*")}$`);

const lineOf = (text, at) => text.slice(0, at).split("\n").length;
const label = (value) => value.slice(0, PREFIX);

/** Blanks each hit, so a finding about a path does not print the term in that path. */
function mask(path, hits) {
  let out = "";
  let cursor = 0;
  for (const { start, end } of [...hits].sort((a, b) => a.start - b.start)) {
    out += `${path.slice(cursor, Math.max(cursor, start))}***`;
    cursor = Math.max(cursor, end);
  }
  return out + path.slice(cursor);
}

/**
 * Scans `files`, relative to `root`, and returns findings as `file:line: reason` strings.
 *
 * `plain` holds patterns that are public anyway, such as a home folder, and stay readable.
 * `ownerAllowed` matches the files where the owner's name is expected.
 */
export function scan({ root, files, list, plain = [], allow = [], binary, ownerAllowed, skip = () => false }) {
  const find = createMatcher(list);
  const denied = (file, text) => find(text).filter((hit) => !(list.owner.has(hit.hash) && ownerAllowed?.test(file)));
  const findings = [];

  for (const file of files) {
    if (skip(file)) continue;
    const path = file.toLowerCase();
    const pathHits = denied(file, path);
    const shown = pathHits.length ? mask(path, pathHits) : file;
    for (const pattern of plain) if (path.includes(pattern)) findings.push(`${shown}: path contains "${pattern}"`);
    for (const value of new Set(pathHits.map((hit) => hit.hash))) findings.push(`${shown}: path contains a denied term, hash ${label(value)}`);

    if (binary?.test(file)) {
      if (!allow.some((re) => re.test(file))) findings.push(`${shown}: binary not on the allow-list`);
      continue;
    }
    const buf = readFileSync(join(root, file));
    if (buf.includes(0)) continue;
    const text = buf.toString("utf8").toLowerCase();
    for (const pattern of plain) {
      const at = text.indexOf(pattern);
      if (at !== -1) findings.push(`${shown}:${lineOf(text, at)}: contains "${pattern}"`);
    }
    const first = new Map();
    for (const hit of denied(file, text)) {
      const known = first.get(hit.hash);
      if (known === undefined || hit.start < known) first.set(hit.hash, hit.start);
    }
    for (const [value, at] of first) findings.push(`${shown}:${lineOf(text, at)}: denied term, hash ${label(value)}`);
  }
  return findings;
}

export const readList = (file) => parseList(readFileSync(file, "utf8"));
export const writeList = (file, list, header) => writeFileSync(file, renderList(list, header));
