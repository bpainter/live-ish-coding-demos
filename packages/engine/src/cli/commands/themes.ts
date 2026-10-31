import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { nearest, UsageError } from "../args";
import { EXIT, environment, printJson, requireDeck, type Ctx, type ExitCode } from "../io";

interface ThemeSummary {
  id: string;
  name?: string;
  traits?: string[];
}

interface ThemesModule {
  listThemes(): ThemeSummary[];
  resolveTheme(id: string, customPaths: string[]): Record<string, unknown>;
}

/** Audience themes ship with the engine. */
async function loadThemes(): Promise<ThemesModule> {
  const file = new URL("../../lib/chrome-themes.ts", import.meta.url);
  if (!existsSync(file)) throw environment("This engine has no audience themes.", "Reinstall @live-ish/engine.");
  return (await import(file.href)) as ThemesModule;
}

export async function themes(ctx: Ctx): Promise<ExitCode> {
  const list = (await loadThemes()).listThemes();
  if (ctx.json) {
    printJson({ themes: list });
    return EXIT.ok;
  }
  const width = Math.max(...list.map((t) => t.id.length));
  for (const t of list) ctx.log(`${t.id.padEnd(width)}  ${t.traits?.join(", ") ?? t.name ?? ""}`);
  return EXIT.ok;
}

/** Writes a custom theme file: the base theme's values under a new id, ready to change. */
export async function themeNew(ctx: Ctx): Promise<ExitCode> {
  const root = requireDeck(ctx);
  const [id] = ctx.positionals;
  if (!id) throw new UsageError("Name the theme: live-ish theme new <id> [--from <theme>].");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new UsageError(`"${id}" is not a valid theme id. Use lowercase letters, digits and dashes.`);
  const from = typeof ctx.flags.from === "string" ? ctx.flags.from : "glass";
  const { listThemes, resolveTheme } = await loadThemes();
  const known = listThemes().map((t) => t.id);
  if (known.includes(id)) throw new UsageError(`"${id}" is a built-in theme. Choose another id.`);
  if (!known.includes(from)) {
    const hint = nearest(from, known);
    throw new UsageError(`Unknown theme "${from}".${hint ? ` Did you mean "${hint}"?` : ""} Use one of: ${known.join(", ")}.`);
  }
  const file = path.join(root, "themes", `${id}.json`);
  if (existsSync(file)) throw new UsageError(`themes/${id}.json exists.`);
  const base = resolveTheme(from, []);
  const name = id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ");
  const theme = { $schema: "../.live-ish/schema/chrome-theme.json", schemaVersion: 1, ...base, id, name, traits: [`Based on ${from}`] };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(theme, null, 2)}\n`);
  if (ctx.json) printJson({ ok: true, id, file: `themes/${id}.json`, from });
  else {
    ctx.log(`Wrote themes/${id}.json from ${from}.`);
    ctx.log(`  Add "./themes/${id}.json" to chrome.custom, set chrome.theme, then run \`live-ish check\`.`);
  }
  return EXIT.ok;
}
