// Reads the pages from disk. No React here: the Next pages, `pnpm generate` and the tests share this,
// so the site, the Markdown copies and the checks all see the same text.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SITE = "https://live-ish.dev";

/** The docs package. `import.meta.url` moves under a bundler, and Next always runs from this folder. */
function findDocs(): string {
  const candidates = [process.cwd(), path.join(path.dirname(fileURLToPath(import.meta.url)), "..")];
  const found = candidates.find((dir) => existsSync(path.join(dir, "content", "index.mdx")));
  if (!found) throw new Error(`No docs content under ${candidates.join(" or ")}.`);
  return found;
}

export const DOCS = findDocs();
export const REPO = path.join(DOCS, "..");
export const CONTENT = path.join(DOCS, "content");
/** Generated pages and fragments. Rebuilt by `pnpm generate`, ignored by git. */
export const GEN = path.join(DOCS, ".gen");

export interface Page {
  slug: string;
  title: string;
  /** What the reader will have when done. Every page opens with it. */
  outcome: string;
  /** Hand-written pages are MDX. Generated error pages are plain Markdown, so a brace is only a brace. */
  format: "mdx" | "md";
  /** The source with generated fragments expanded. */
  body: string;
  file: string;
}

function walk(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found;
  for (const name of readdirSync(dir).sort()) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) walk(file, found);
    else if (/\.mdx?$/.test(name)) found.push(file);
  }
  return found;
}

/** `key: value` lines between `---` fences. Pages need no more than that. */
export function parseFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return { data: {}, body: text };
  const data: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const at = line.indexOf(":");
    if (at > 0) data[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { data, body: text.slice(match[0].length) };
}

/** Swaps `<Generated name="x" />` for `.gen/fragments/x.md`. A missing fragment stops the build. */
export function expand(body: string): string {
  return body.replace(/<Generated name="([a-z-]+)" \/>/g, (_, name: string) => {
    const file = path.join(GEN, "fragments", `${name}.md`);
    if (!existsSync(file)) throw new Error(`No fragment "${name}". Run pnpm generate.`);
    return readFileSync(file, "utf8").trim();
  });
}

function readPage(root: string, file: string): Page {
  const { data, body } = parseFrontmatter(readFileSync(file, "utf8"));
  const relative = path.relative(root, file).split(path.sep).join("/");
  const slug = relative
    .replace(/\.mdx?$/, "")
    .replace(/\/index$/, "")
    .replace(/^index$/, "");
  if (!data.title) throw new Error(`${relative} has no title.`);
  if (!data.outcome) throw new Error(`${relative} has no outcome.`);
  return { slug, title: data.title, outcome: data.outcome, format: file.endsWith(".mdx") ? "mdx" : "md", body: expand(body), file };
}

/** Every page, hand-written and generated. */
export function allPages(): Page[] {
  const pagesDir = path.join(GEN, "pages");
  const pages = [...walk(CONTENT).map((f) => readPage(CONTENT, f)), ...walk(pagesDir).map((f) => readPage(pagesDir, f))];
  return pages.sort((a, b) => a.slug.localeCompare(b.slug));
}

export function pageBySlug(slug: string): Page | undefined {
  return allPages().find((page) => page.slug === slug);
}

/** A page's address on the site. */
export const pageHref = (slug: string) => (slug ? `/${slug}` : "/");

/** The Markdown copy's address. */
export const markdownHref = (slug: string) => (slug ? `/${slug}.md` : "/index.md");

/** JSX that only the site can draw. The Markdown copy says the same thing in its table or text. */
const SITE_ONLY = /^<(ThemeSwatches)\b.*\/>\n?/gm;

/** The page as plain Markdown, for tools and for `llms.txt`. */
export function toMarkdown(page: Page): string {
  return `# ${page.title}\n\n${page.outcome}\n\n${page.body
    .replace(SITE_ONLY, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}
