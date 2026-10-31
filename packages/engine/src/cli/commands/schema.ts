import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { ENGINE, EXIT, environment, printJson, requireDeck, type Ctx, type ExitCode } from "../io";

/** Built from the engine's TypeScript types by `scripts/build-schema.mjs`, and shipped in `dist/`. */
export const SCHEMA_DIST = path.join(ENGINE, "dist", "schema");
export const SCHEMA_FILES = ["deck-config.json", "slide.json", "demo.json", "recording.json", "chrome-theme.json"];

/** Inside this repo the types can be ahead of `dist/`. A published engine ships them built. */
function refreshInRepo() {
  const script = path.join(ENGINE, "scripts", "build-schema.mjs");
  if (!existsSync(script)) return;
  const built = SCHEMA_FILES.every((f) => existsSync(path.join(SCHEMA_DIST, f))) ? statSync(path.join(SCHEMA_DIST, SCHEMA_FILES[0])).mtimeMs : 0;
  const dir = path.join(ENGINE, "src", "schema");
  if (built && readdirSync(dir).every((f) => statSync(path.join(dir, f)).mtimeMs <= built)) return;
  spawnSync(process.execPath, [script], { cwd: ENGINE, stdio: "ignore" });
}

export function writeSchemas(root: string): string[] {
  refreshInRepo();
  const out = path.join(root, ".live-ish", "schema");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const file of SCHEMA_FILES) {
    const from = path.join(SCHEMA_DIST, file);
    if (!existsSync(from)) throw environment(`This engine is missing ${file}.`, "Reinstall @live-ish/engine.");
    copyFileSync(from, path.join(out, file));
  }
  return SCHEMA_FILES.map((f) => `.live-ish/schema/${f}`);
}

export async function schema(ctx: Ctx): Promise<ExitCode> {
  const files = writeSchemas(requireDeck(ctx));
  if (ctx.json) printJson({ ok: true, files });
  else ctx.log(`Wrote ${files.length} schemas to .live-ish/schema/.`);
  return EXIT.ok;
}
