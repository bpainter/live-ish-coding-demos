import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { UsageError } from "../args";
import { addServer, ConfigEditError, insertOrderId, readOrder } from "../edit-config";
import { CliError, ENGINE, EXIT, printJson, requireDeck, type Ctx, type ExitCode } from "../io";
import type { CopyLayout } from "../../schema/slide";
import { portAnswers } from "../process";
import { recordDemo } from "./record";

const TEMPLATES = path.join(ENGINE, "templates");

export const LAYOUTS: CopyLayout[] = ["content", "title", "closing", "grid", "statement", "section", "quotes", "people", "image", "stat", "comparison", "table", "timeline", "chart"];

/** The first port a server-backed demo takes, leaving the deck's own 3000 range alone. */
const FIRST_SERVER_PORT = 3106;

/** "My point!" to "my-point". */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The next `NN-` prefix under `slides/`, past the highest in use. */
export function nextSlideNumber(names: string[]): string {
  const used = names.map((n) => Number.parseInt(n, 10)).filter(Number.isFinite);
  return String(Math.max(0, ...used) + 1).padStart(2, "0");
}

/** A string for inside a double-quoted TypeScript literal. */
const literal = (text: string) => JSON.stringify(text).slice(1, -1);

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);

/** Copies a template folder. A `.tmpl` file is filled in and loses the suffix; others copy as they are. */
function copyTemplate(name: string, dest: string, vars: Record<string, string>, root: string): string[] {
  const from = path.join(TEMPLATES, name);
  const written: string[] = [];
  for (const e of readdirSync(from, { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || e.name === ".DS_Store") continue;
    const abs = path.join(e.parentPath, e.name);
    const rel = path.relative(from, abs).replace(/\.tmpl$/, "");
    const target = path.join(dest, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    const body = readFileSync(abs, "utf8");
    writeFileSync(target, abs.endsWith(".tmpl") ? fill(body, vars) : body);
    written.push(path.relative(root, target).split(path.sep).join("/"));
  }
  return written.sort();
}

const CONFIG = "deck.config.ts";

function readConfig(root: string): string {
  return readFileSync(path.join(root, CONFIG), "utf8");
}

/** Every id a slide or demo already holds, so a new one cannot shadow it. */
function usedIds(root: string): Set<string> {
  const ids = new Set(readOrder(readConfig(root)));
  const slides = path.join(root, "slides");
  if (existsSync(slides)) {
    for (const f of readdirSync(slides)) {
      const id = /\bid:\s*["'`]([^"'`]+)["'`]/.exec(readFileSync(path.join(slides, f), "utf8"))?.[1];
      if (id) ids.add(id);
    }
  }
  const demos = path.join(root, "demos");
  if (existsSync(demos)) for (const d of readdirSync(demos)) if (statSync(path.join(demos, d)).isDirectory()) ids.add(d);
  return ids;
}

/** A closing slide stays last: a new slide goes ahead of it. */
function closingId(root: string): string | undefined {
  const last = readOrder(readConfig(root)).at(-1);
  const dir = path.join(root, "slides");
  if (!last || !existsSync(dir)) return undefined;
  const closes = readdirSync(dir).some((f) => {
    const text = readFileSync(path.join(dir, f), "utf8");
    return new RegExp(`\\bid:\\s*["'\`]${last}["'\`]`).test(text) && /\blayout:\s*["'`]closing["'`]/.test(text);
  });
  return closes ? last : undefined;
}

function addToOrder(root: string, id: string): void {
  const file = path.join(root, CONFIG);
  try {
    writeFileSync(file, insertOrderId(readConfig(root), id, closingId(root)));
  } catch (error) {
    if (error instanceof ConfigEditError) throw new CliError(error.message, EXIT.findings, `The files are written. Add "${id}" to order yourself.`);
    throw error;
  }
}

function checkFreeId(root: string, id: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new UsageError(`"${id}" is not a valid id. Use lowercase letters, digits and dashes.`);
  if (usedIds(root).has(id)) throw new UsageError(`The id "${id}" is taken. Choose another.`);
}

/** "count-words" to "Count words". */
const titleOf = (id: string) => {
  const text = id.replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

function finish(ctx: Ctx, kind: string, id: string, files: string[], next: string[]): ExitCode {
  if (ctx.json) printJson({ ok: true, kind, id, files });
  else {
    ctx.log(`Wrote ${files.length === 1 ? files[0] : `${files.length} files`} and added "${id}" to order.`);
    for (const line of next) ctx.log(`  ${line}`);
  }
  return EXIT.ok;
}

function newCopy(ctx: Ctx, root: string): ExitCode {
  const title = ctx.positionals.join(" ").trim();
  if (!title) throw new UsageError('Name the slide: live-ish new copy "My point".');
  const layout = (typeof ctx.flags.layout === "string" ? ctx.flags.layout : "content") as CopyLayout;
  if (!LAYOUTS.includes(layout)) throw new UsageError(`Unknown layout "${layout}". Use one of: ${LAYOUTS.join(", ")}.`);
  const id = slugify(title);
  if (!id) throw new UsageError(`"${title}" has no letters or digits to make an id from.`);
  checkFreeId(root, id);
  const dir = path.join(root, "slides");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${nextSlideNumber(readdirSync(dir))}-${id}.ts`);
  const body = readFileSync(path.join(TEMPLATES, "copy", `${layout}.ts.tmpl`), "utf8");
  writeFileSync(file, fill(body, { id, title: literal(title) }));
  const files = [path.relative(root, file)];
  if (layout === "image") {
    const image = path.join(root, "public", "images", "placeholder.svg");
    if (!existsSync(image)) {
      mkdirSync(path.dirname(image), { recursive: true });
      writeFileSync(image, readFileSync(path.join(TEMPLATES, "copy", "placeholder.svg")));
      files.push(path.relative(root, image));
    }
  }
  addToOrder(root, id);
  return finish(ctx, "copy", id, files, [`Edit ${files[0]}, then run \`live-ish check\`.`]);
}

async function nextPort(root: string): Promise<number> {
  const used = [...readConfig(root).matchAll(/\bport:\s*(\d+)/g)].map((m) => Number(m[1]));
  let port = FIRST_SERVER_PORT;
  while (used.includes(port) || (await portAnswers(port))) port++;
  return port;
}

async function newWebDemo(ctx: Ctx, root: string): Promise<ExitCode> {
  const [id] = ctx.positionals;
  if (!id) throw new UsageError("Name the demo: live-ish new web-demo <id>.");
  const { static: isStatic, single, server } = ctx.flags;
  if (server && isStatic) throw new UsageError("--server and --static exclude each other: a server-backed demo is not static.");
  checkFreeId(root, id);
  const dest = path.join(root, "demos", id);
  const vars = { id, title: titleOf(id), kind: isStatic ? "static" : "web", port: "" };
  if (server) {
    const port = await nextPort(root);
    vars.port = String(port);
    const files = copyTemplate("web-demo-server", dest, vars, root);
    const app = { app: id, command: `node demos/${id}/single/server.mjs`, port, origin: `http://localhost:${port}` };
    const file = path.join(root, CONFIG);
    try {
      writeFileSync(file, addServer(readConfig(root), app));
    } catch (error) {
      if (error instanceof ConfigEditError) throw new CliError(error.message, EXIT.findings, `Add { app: "${id}", command: "${app.command}", port: ${port} } to servers, and ${id}: "${app.origin}" to hosts.external.`);
      throw error;
    }
    addToOrder(root, id);
    return finish(ctx, "web-demo", id, files, [`\`live-ish dev\` starts the server on port ${port}. Open /s/${id}.`]);
  }
  const files = copyTemplate(single ? "web-demo-single" : isStatic ? "web-demo-static" : "web-demo", dest, vars, root);
  addToOrder(root, id);
  return finish(ctx, "web-demo", id, files, [`Press the arrow keys at /s/${single ? id : `${id}-before`}, then run \`live-ish check\`.`]);
}

function newTerminalDemo(ctx: Ctx, root: string): ExitCode {
  const [id] = ctx.positionals;
  if (!id) throw new UsageError("Name the demo: live-ish new terminal-demo <id>.");
  checkFreeId(root, id);
  const dest = path.join(root, "demos", id);
  const files = copyTemplate("terminal-demo", dest, { id, title: titleOf(id) }, root);
  // The template's own session records here, so the demo plays before anything is edited.
  const { file } = recordDemo(root, id);
  files.push(file);
  addToOrder(root, id);
  return finish(ctx, "terminal-demo", id, files.sort(), [`Edit session.txt, then run \`live-ish record ${id}\`. Press the arrow keys at /s/${id}.`]);
}

const KINDS: Record<string, (ctx: Ctx, root: string) => ExitCode | Promise<ExitCode>> = { copy: newCopy, "web-demo": newWebDemo, "terminal-demo": newTerminalDemo };

export async function create(ctx: Ctx, kind: string): Promise<ExitCode> {
  return KINDS[kind](ctx, requireDeck(ctx));
}
