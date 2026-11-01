import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import path from "node:path";
import { CliError, EXIT, environment, readSummary, requireDeck, type Ctx, type ExitCode } from "../cli/io";
import { runNext, spawnNext } from "../cli/process";
import { flagsQuery } from "../lib/frames/origins";
import { keepsNotes, prepareDeck } from "../prepare";
import { collectNotes } from "../prepare/strip";
import { frameRefs, planExport, staticFrame, type ExportPlan } from "./plan";

const DIST = ".next-export";
const DEFAULT_OUT = path.join(".live-ish", "export");

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });

function save(out: string, urlPath: string, body: string | Buffer) {
  const file = path.join(out, urlPath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
}

/** Files under `dir`, as paths relative to it. */
function filesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => statSync(path.join(dir, f)).isFile());
}

/** Writes a frame's documents and everything they refer to, as the built server answers them. */
async function crawlFrames(origin: string, out: string, root: string, plan: ExportPlan): Promise<number> {
  const queue = new Set<string>();
  const done = new Set<string>();
  let documents = 0;
  const follow = (text: string, from: string) => frameRefs(text, from).forEach((ref) => queue.add(ref));
  for (const frame of plan.live) {
    for (const { flags, file } of frame.documents) {
      const urlPath = `${frame.route}/${file}`;
      const res = await fetch(`${origin}${frame.route}/index.html${flagsQuery(flags) ? `?flags=${flagsQuery(flags)}` : ""}`);
      if (!res.ok) throw new CliError(`${frame.route} answered ${res.status} while exporting.`, EXIT.findings);
      const html = await res.text();
      save(out, urlPath, staticFrame(html, res.headers.get("content-security-policy") ?? ""));
      done.add(urlPath);
      documents++;
      follow(html, urlPath);
    }
    // A script can ask for a file no markup names.
    if (frame.dir) for (const f of filesIn(path.join(root, frame.dir))) queue.add(`${frame.route}/${f.split(path.sep).join("/")}`);
  }
  for (const urlPath of queue) {
    if (done.has(urlPath)) continue;
    done.add(urlPath);
    const res = await fetch(`${origin}${urlPath}`);
    if (!res.ok) continue;
    const type = res.headers.get("content-type") ?? "";
    if (type.startsWith("text/html")) {
      const html = await res.text();
      save(out, urlPath, staticFrame(html, res.headers.get("content-security-policy") ?? ""));
      follow(html, urlPath);
    } else if (type.startsWith("text/css")) {
      const css = await res.text();
      save(out, urlPath, css);
      follow(css, urlPath);
    } else save(out, urlPath, Buffer.from(await res.arrayBuffer()));
  }
  return documents;
}

async function crawlPages(origin: string, out: string, slides: string[]) {
  for (const urlPath of ["/", ...slides.map((id) => `/s/${id}`)]) {
    const res = await fetch(`${origin}${urlPath}`);
    if (!res.ok) throw new CliError(`${urlPath} answered ${res.status} while exporting.`, EXIT.findings);
    save(out, path.join(urlPath, "index.html"), await res.text());
  }
  save(out, "404.html", await (await fetch(`${origin}/live-ish-export-missing-page`)).text());
  for (const file of ["/sitemap.xml", "/robots.txt"]) save(out, file, await (await fetch(`${origin}${file}`)).text());
}

function leakedNotes(out: string, notes: string[]): string[] {
  return filesIn(out).filter((f) => /\.(html|js|json|txt)$/.test(f) && notes.some((n) => readFileSync(path.join(out, f), "utf8").includes(n)));
}

/**
 * `live-ish export`: a reader-only static site. The frame routes are route handlers that read the
 * request, which `output: "export"` refuses, so this builds the deck as usual, serves it on a private
 * port and writes down what it answers. A moved slide works as a full page load on a static host,
 * because RSC payloads vary by a header no static host can see.
 */
export async function exportDeck(ctx: Ctx): Promise<ExitCode> {
  const root = requireDeck(ctx);
  const out = path.resolve(root, typeof ctx.flags.out === "string" ? ctx.flags.out : DEFAULT_OUT);
  const assembled = await prepareDeck(root, "export");
  const site = (typeof ctx.flags.site === "string" ? ctx.flags.site : undefined) ?? process.env.LIVE_ISH_SITE_ORIGIN ?? readSummary(root).hosts.site;
  if (!site) throw new CliError("An export needs an address for its canonical URLs and share cards.", EXIT.findings, "Set hosts.site in deck.config.ts, or pass --site=https://talk.example.com.");

  const plan = planExport(assembled);
  writeFileSync(path.join(root, ".live-ish", "export-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  const env = { LIVE_ISH_TARGET: "deployed", LIVE_ISH_EXPORT: "1", LIVE_ISH_PREPARED: root, LIVE_ISH_SITE_ORIGIN: site, LIVE_ISH_FRAMES_ORIGIN: "", NEXT_DIST_DIR: DIST };
  const built = await runNext(root, ["build"], { ...process.env, ...env });
  if (built !== 0) {
    rmSync(path.join(root, DIST), { recursive: true, force: true });
    return EXIT.findings;
  }

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawnNext(root, ["start", "-p", String(port), "-H", "127.0.0.1"], { env: { ...process.env, ...env }, stdio: "ignore" });
  try {
    const until = Date.now() + 30_000;
    while (!(await fetch(`${origin}/_health`).then((r) => r.ok, () => false))) {
      if (Date.now() > until) throw environment("The build did not start, so there was nothing to export.");
      await new Promise((r) => setTimeout(r, 200));
    }
    rmSync(out, { recursive: true, force: true });
    await crawlPages(origin, out, assembled.slides.map((s) => s.id));
    const documents = await crawlFrames(origin, out, root, plan);
    cpSync(path.join(root, "public"), out, { recursive: true });
    cpSync(path.join(root, DIST, "static"), path.join(out, "_next", "static"), { recursive: true });
    const notes = keepsNotes(assembled, "export") ? [] : leakedNotes(out, collectNotes(assembled));
    if (notes.length) throw new CliError(`Speaker notes reached the export, in ${notes.join(", ")}.`, EXIT.findings, "A routes.ts must not import its demo.ts.");
    ctx.log(`Exported ${assembled.slides.length} slides and ${documents} frame documents to ${path.relative(root, out) || "."}.`);
    for (const { route, why } of plan.posters) ctx.log(`  ${route} shows its poster: ${why}.`);
    return EXIT.ok;
  } finally {
    server.kill("SIGTERM");
    rmSync(path.join(root, DIST), { recursive: true, force: true });
  }
}
