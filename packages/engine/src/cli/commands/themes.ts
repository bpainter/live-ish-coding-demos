import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { nearest, UsageError } from "../args";
import { EXIT, findDeck, printJson, readSummary, requireDeck, type Ctx, type ExitCode } from "../io";

/** A deck's custom themes, when this runs inside a prepared deck. */
function customPaths(root: string | null): string[] {
  if (!root) return [];
  try {
    return readSummary(root).customThemes ?? [];
  } catch {
    return [];
  }
}

export async function themes(ctx: Ctx): Promise<ExitCode> {
  const { listThemes } = await import("../../lib/chrome-themes");
  const root = findDeck(ctx.cwd);
  const list = listThemes(customPaths(root), root ?? ctx.cwd);
  if (ctx.json) {
    printJson({ themes: list });
    return EXIT.ok;
  }
  const width = Math.max(...list.map((t) => t.id.length));
  for (const t of list) ctx.log(`${t.id.padEnd(width)}  ${t.traits.join(", ")}`);
  return EXIT.ok;
}

/** Writes a custom theme file that takes everything it leaves out from the base theme. */
export async function themeNew(ctx: Ctx): Promise<ExitCode> {
  const root = requireDeck(ctx);
  const [id] = ctx.positionals;
  if (!id) throw new UsageError("Name the theme: live-ish theme new <id> [--from <theme>].");
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new UsageError(`"${id}" is not a valid theme id. Start with a letter, then use lowercase letters, digits and dashes.`);
  const from = typeof ctx.flags.from === "string" ? ctx.flags.from : "glass";
  const { builtInIds } = await import("../../lib/chrome-themes");
  const known = builtInIds();
  if (known.includes(id)) throw new UsageError(`"${id}" is a built-in theme. Choose another id.`);
  if (!known.includes(from)) {
    const hint = nearest(from, known);
    throw new UsageError(`Unknown theme "${from}".${hint ? ` Did you mean "${hint}"?` : ""} Use one of: ${known.join(", ")}.`);
  }
  const file = path.join(root, "themes", `${id}.json`);
  if (existsSync(file)) throw new UsageError(`themes/${id}.json exists.`);
  const name = id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ");
  const theme = { $schema: "../.live-ish/schema/chrome-theme.json", schemaVersion: 1, id, name, extends: from, traits: [`Based on ${from}`], tokens: {} };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(theme, null, 2)}\n`);
  if (ctx.json) printJson({ ok: true, id, file: `themes/${id}.json`, from });
  else {
    ctx.log(`Wrote themes/${id}.json, which takes what it leaves out from ${from}.`);
    ctx.log(`  Add "./themes/${id}.json" to chrome.custom, set chrome.theme, then run \`live-ish check\`.`);
  }
  return EXIT.ok;
}
