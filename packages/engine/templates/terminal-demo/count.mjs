import { readFile } from "node:fs/promises";

const file = process.argv[2];
const text = await readFile(file, "utf8");
const items = text.trim().split("\n");

console.log(`${items.length} items`);
