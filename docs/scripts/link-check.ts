/**
 * Crawls the built site over HTTP from every sitemap entry: every link, image, script and stylesheet
 * must answer, and every fragment must name an id on its page. Run `pnpm docs:build` first.
 *
 *   pnpm --filter docs check:links
 *   pnpm --filter docs check:links --external    also fetch links to other sites
 *
 * Links to live-ish.vercel.app count as links to this build, so the site's own absolute links are checked.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DOCS, REPO, SITE } from "../lib/source";

const PORT = process.env.LINK_CHECK_PORT ?? "3177";
const BASE = `http://localhost:${PORT}`;
const EXTERNAL = process.argv.includes("--external");

if (!existsSync(path.join(DOCS, ".next", "BUILD_ID"))) {
  console.error("There is no build. Run pnpm docs:build first.");
  process.exit(3);
}

const server = spawn(process.execPath, [path.join(REPO, "packages", "engine", "bin", "live-ish.mjs"), "start", `--port=${PORT}`], { cwd: DOCS, stdio: "ignore", detached: true });
const stopServer = () => {
  if (server.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
};

async function waitForServer() {
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    if (
      await fetch(`${BASE}/_health`)
        .then((r) => r.ok)
        .catch(() => false)
    )
      return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`No answer from ${BASE}.`);
}

const decode = (href: string) => href.replace(/&amp;/g, "&");
const seen = new Map<string, { status: number; html?: string }>();
const broken = new Map<string, string[]>();
const external = new Map<string, string[]>();
const fragments: { page: string; from: string; id: string }[] = [];
const report = (target: string, from: string, map = broken) => map.set(target, [...(map.get(target) ?? []), from]);

/** Same-origin addresses and live-ish.vercel.app addresses, as a path. Other sites return null. */
function internalPath(href: string, from: string): string | null {
  if (href.startsWith("mailto:") || href.startsWith("data:") || href.startsWith("blob:")) return null;
  const url = new URL(href, BASE + from);
  if (url.origin === BASE || url.origin === SITE) return url.pathname + url.search + url.hash;
  return null;
}

async function visit(target: string): Promise<void> {
  const key = target.split("#")[0];
  if (seen.has(key)) return;
  seen.set(key, { status: 0 });
  const res = await fetch(BASE + key, { redirect: "follow" });
  const type = res.headers.get("content-type") ?? "";
  const html = type.includes("text/html") ? await res.text() : undefined;
  seen.set(key, { status: res.status, html });
  if (!html || res.status >= 400) return;

  // Frame documents are demos, with links only the runtime follows.
  if (key.startsWith("/demos/")) return;
  const links = [...html.matchAll(/<(?:a|link|img|script|source)\b[^>]*?\b(?:href|src)="([^"]+)"/g)].map((m) => decode(m[1]));
  for (const href of links) {
    if (href.startsWith("#")) {
      fragments.push({ page: key, from: key, id: href.slice(1) });
      continue;
    }
    const inner = internalPath(href, key);
    if (inner === null) {
      if (/^https?:/.test(href)) report(href, key, external);
      continue;
    }
    if (inner.includes("#")) fragments.push({ page: inner.split("#")[0], from: key, id: inner.split("#")[1] });
    queue.push({ target: inner, from: key });
  }
}

const queue: { target: string; from: string }[] = [];

try {
  await waitForServer();
  const sitemap = readFileSync(path.join(DOCS, "public", "sitemap.xml"), "utf8");
  for (const [, loc] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) queue.push({ target: loc.replace(SITE, "") || "/", from: "sitemap.xml" });
  for (const file of ["/llms.txt", "/robots.txt", "/sitemap.xml", "/index.md"]) queue.push({ target: file, from: "list" });
  const llms = readFileSync(path.join(DOCS, "public", "llms.txt"), "utf8");
  for (const [, address] of llms.matchAll(/\]\((https:\/\/live-ish\.vercel\.app[^)]+)\)/g)) queue.push({ target: address.replace(SITE, ""), from: "llms.txt" });

  while (queue.length) {
    const batch = queue.splice(0, 16);
    await Promise.all(
      batch.map(async ({ target, from }) => {
        await visit(target);
        const status = seen.get(target.split("#")[0])?.status ?? 0;
        if (status === 0 || status >= 400) report(`${target} (${status})`, from);
      }),
    );
  }

  for (const { page, from, id } of fragments) {
    const html = seen.get(page)?.html;
    if (html && !html.includes(`id="${id}"`)) report(`${page}#${id} (no such id)`, from);
  }

  if (EXTERNAL) {
    for (const url of external.keys()) {
      const status = await fetch(url, { method: "HEAD", redirect: "follow" })
        .then((r) => r.status)
        .catch(() => 0);
      if (status === 0 || status >= 400) report(`${url} (${status})`, "external");
    }
  }

  const pages = [...seen.values()].filter((p) => p.html).length;
  console.log(`link check: ${seen.size} addresses, ${pages} HTML pages, ${fragments.length} fragments, ${external.size} external links ${EXTERNAL ? "fetched" : "listed, not fetched"}`);
  if (broken.size) {
    for (const [target, from] of broken) console.error(`BROKEN ${target}, linked from ${[...new Set(from)].slice(0, 3).join(", ")}`);
    console.error(`link check: ${broken.size} broken`);
    process.exitCode = 1;
  } else console.log("link check: 0 broken");
} finally {
  stopServer();
}
