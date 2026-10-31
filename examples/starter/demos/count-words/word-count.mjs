import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const showTop = args.includes("--top");
const file = args.at(-1);

const text = await readFile(file, "utf8");
const words = text
  .toLowerCase()
  .match(/[a-z']+/g);

console.log(`${words.length} words`);

if (showTop) {
  const counts = new Map();
  for (const word of words) {
    const n = counts.get(word) ?? 0;
    counts.set(word, n + 1);
  }
  const ranked = [...counts].sort(
    (a, b) => b[1] - a[1],
  );
  const first = ranked.slice(0, 3);
  for (const [word, n] of first) {
    console.log(`${n} ${word}`);
  }
}
