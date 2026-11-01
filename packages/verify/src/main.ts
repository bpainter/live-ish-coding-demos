import { createRequire } from "node:module";
import { run } from "./cli";

/** Runs a verify command with no engine CLI around it: `live-ish-verify walk`, from a deck folder. */
const require = createRequire(`${process.cwd()}/package.json`);
let engineVersion = "0.0.0";
try {
  engineVersion = (require("@live-ish/engine/package.json") as { version: string }).version;
} catch {
  // Outside a deck, the walk says so itself.
}
process.exitCode = await run(process.argv.slice(2), { root: process.cwd(), engineVersion });
