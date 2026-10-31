import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { requiredCodePoints, scanCharacters } from "../../lib/validate/fonts";
import { CliError, EXIT, environment, printJson, requireDeck, resolveFromDeck, type Ctx, type ExitCode } from "../io";

/**
 * Subsets each master in public/fonts/ to a Latin WOFF2 under public/fonts/v<n>/. The subset keeps the
 * ranges the `fonts` rule reads, plus every character the deck's text uses. The folder is write-once: fonts are served
 * as immutable, so a file that would change is refused, and the fix is a new folder with `--next`.
 *
 *   live-ish fonts            write the subsets that are missing, then check every one
 *   live-ish fonts --check    check only
 *   live-ish fonts --next     start the next folder
 */

/**
 * OpenType features kept: the ones browsers turn on by default, plus tnum for tabular numbers.
 * Stylistic sets, alternates, fractions and superiors are never asked for, and dropping them takes
 * about a fifth off each file. Hinting stays.
 */
const FEATURES = ["kern", "mark", "mkmk", "ccmp", "locl", "liga", "clig", "calt", "rlig", "tnum"];

const MASTER = /\.(otf|ttf|woff2)$/i;
/** Not a dependency: a deck on system fonts should not carry a font shaper. */
const SUBSET_VERSION = "2.9.0";

type Subset = (font: Buffer, text: string, options: { targetFormat: "woff2"; keepFeatures: string[] }) => Promise<Uint8Array>;

const subsetText = (root: string) => String.fromCodePoint(...[...requiredCodePoints(scanCharacters(root).keys())].sort((a, b) => a - b));

const folderNumbers = (dir: string) =>
  readdirSync(dir)
    .map((name) => /^v(\d+)$/.exec(name)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex").slice(0, 12);

export async function fonts(ctx: Ctx): Promise<ExitCode> {
  const root = requireDeck(ctx);
  const dir = path.join(root, "public", "fonts");
  const masters = existsSync(dir) ? readdirSync(dir).filter((f) => MASTER.test(f)).sort() : [];
  if (masters.length === 0) {
    if (ctx.json) printJson({ ok: true, fonts: [] });
    else ctx.log("No fonts under public/fonts/. The deck uses system fonts.");
    return EXIT.ok;
  }
  const entry = resolveFromDeck(root, "subset-font");
  if (!entry) throw environment("`live-ish fonts` needs subset-font.", `Add it to this deck: subset-font@${SUBSET_VERSION}`);
  const subsetFont = ((await import(pathToFileURL(entry).href)) as { default: Subset }).default;

  const used = folderNumbers(dir);
  const latest = used.length ? Math.max(...used) : 0;
  const version = ctx.flags.next === true ? latest + 1 : Math.max(latest, 1);
  const folder = `v${version}`;
  const checkOnly = ctx.flags.check === true;
  const text = subsetText(root);
  const results: { master: string; file: string; state: string; kb: number }[] = [];
  const problems: string[] = [];
  for (const master of masters) {
    const name = `${path.basename(master, path.extname(master))}.woff2`;
    const rel = `fonts/${folder}/${name}`;
    const out = path.join(root, "public", rel);
    const bytes = Buffer.from(await subsetFont(readFileSync(path.join(dir, master)), text, { targetFormat: "woff2", keepFeatures: FEATURES }));
    const kb = +(bytes.length / 1024).toFixed(1);
    if (existsSync(out)) {
      const old = readFileSync(out);
      if (old.equals(bytes)) results.push({ master, file: rel, state: "unchanged", kb });
      else problems.push(`${rel} exists with other bytes (${sha(old)}, new ${sha(bytes)}). Deck text changed, and fonts are served as immutable. Run \`live-ish fonts --next\`.`);
    } else if (checkOnly) {
      problems.push(`${rel} is missing. Run \`live-ish fonts\`.`);
    } else {
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, bytes);
      results.push({ master, file: rel, state: "written", kb });
    }
  }
  if (ctx.json) printJson({ ok: problems.length === 0, fonts: results, problems });
  else {
    for (const r of results) ctx.log(`  ${r.file}: ${r.state}, ${r.kb} KB`);
    for (const p of problems) ctx.log(`✖ ${p}`);
    if (!problems.length) ctx.log(`fonts: ${results.length} subset(s) under public/fonts/${folder}/ keep every character the deck uses.`);
  }
  if (problems.length && !ctx.json) throw new CliError(`${problems.length} font problem(s).`, EXIT.findings);
  return problems.length ? EXIT.findings : EXIT.ok;
}
