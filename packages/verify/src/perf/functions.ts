import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { EnvironmentError, numberOpt } from "../lib/args";
import type { Report } from "../lib/report";
import { table } from "../lib/stats";
import { writeResult, type PerfContext } from "./lib";

/**
 * The traced size of each route's function, from a production build's `.nft.json` files. Each route
 * counts the unique files its trace names plus its entry file, and the "with runtime" column adds
 * Next's server trace, which every function also carries.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (e.name.endsWith(".nft.json")) out.push(abs);
  }
  return out;
}

function traced(nft: string): string[] {
  const { files } = JSON.parse(readFileSync(nft, "utf8")) as { files: string[] };
  const dir = path.dirname(nft);
  return [nft.replace(/\.nft\.json$/, ""), ...files.map((f) => path.resolve(dir, f))];
}

function size(files: Iterable<string>): number {
  let n = 0;
  for (const f of files) {
    try {
      const s = statSync(f);
      if (s.isFile()) n += s.size;
    } catch {
      // A traced file that is not on disk, an optional dependency, is not shipped either.
    }
  }
  return n;
}

/** `@shikijs+langs@4.5.0` and `next@16.4.3_react@…` in node_modules/.pnpm to `@shikijs/langs` and `next`. */
export function pnpmName(id: string): string {
  const at = id.indexOf("@", 1);
  return (at > 0 ? id.slice(0, at) : id).replace("+", "/");
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

/** The top-level groups that make up a trace, by size. */
function groups(files: string[], root: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of files) {
    const rel = path.relative(root, f);
    const parts = rel.split(path.sep);
    const key = parts[0] === "node_modules" ? `node_modules/${parts[1] === ".pnpm" ? pnpmName(parts[2] ?? "") : parts[1]}` : parts.slice(0, Math.min(2, parts.length - 1)).join("/") || rel;
    try {
      out[key] = (out[key] ?? 0) + statSync(f).size;
    } catch {
      // See size().
    }
  }
  return out;
}

export async function run({ deck, args }: PerfContext, report: Report): Promise<void> {
  const root = path.resolve(args.opt("root") ?? deck.root);
  const dist = path.join(root, args.opt("dist") ?? process.env.NEXT_DIST_DIR ?? ".next");
  const top = numberOpt(args, "top", 5);
  const appDir = path.join(dist, "server", "app");
  if (!existsSync(appDir)) throw new EnvironmentError(`${appDir} not found. Build the deck first.`);
  const runtimeNft = path.join(dist, "next-server.js.nft.json");
  const runtime = new Set(existsSync(runtimeNft) ? traced(runtimeNft) : []);
  const rows = walk(appDir)
    .map((nft) => {
      const files = [...new Set(traced(nft))];
      const route = `/${path.relative(appDir, nft).replace(/\/(page|route)\.js\.nft\.json$/, "").replace(/^(page|route)\.js\.nft\.json$/, "")}`;
      const all = new Set([...files, ...runtime]);
      const g = Object.entries(groups(files, root)).sort((a, b) => b[1] - a[1]);
      return { route: route === "/" ? "/" : route.replace(/\/$/, ""), files: files.length, bytes: size(files), withRuntime: size(all), largest: g.slice(0, top).map(([k, v]) => `${k} ${mb(v)}`) };
    })
    .sort((a, b) => b.bytes - a.bytes);
  const file = writeResult(deck.root, "functions", args.opt("label"), { task: "functions", dist: path.relative(root, dist) || dist, runtimeBytes: size(runtime), rows });
  report.log(table(["Route", "Files", "MB", "MB with runtime", "Largest groups (MB)"], rows.map((r) => [r.route, r.files, mb(r.bytes), mb(r.withRuntime), r.largest.join(", ")])));
  report.data.routes = rows.length;
  report.pass(`${rows.length} route(s), Next server runtime trace ${mb(size(runtime))} MB; wrote ${file}`);
}
