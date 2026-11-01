// MDX to React at build time. Pages are read from disk, so a single route serves them all and the
// Markdown copies come from the same text.
import { compile, run } from "@mdx-js/mdx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import * as runtime from "react/jsx-runtime";
import remarkGfm from "remark-gfm";
import type { Page } from "./source";

/** The heading text as an id. The link check reads these, so a fragment link cannot go stale. */
export function headingId(children: ReactNode): string {
  const text = (node: ReactNode): string => {
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(text).join("");
    if (node && typeof node === "object" && "props" in node) return text((node.props as { children?: ReactNode }).children);
    return "";
  };
  return text(children)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function Heading({ level, children }: { level: 2 | 3; children?: ReactNode }) {
  const Tag = `h${level}` as const;
  const id = headingId(children);
  return (
    <Tag id={id}>
      <a className="page__anchor" href={`#${id}`}>
        {children}
      </a>
    </Tag>
  );
}

/** Client navigation for docs pages. The live deck has its own root layout, and files are files. */
const FULL_LOAD = /^\/(s|present|speaker)(\/|\?|$)|\.[a-z]+$/;

function SmartLink({ href = "", children }: ComponentProps<"a">) {
  if (href.startsWith("/") && !FULL_LOAD.test(href)) return <Link href={href}>{children}</Link>;
  return <a href={href}>{children}</a>;
}

/** Wide tables scroll inside their own box, and the box can take focus so a keyboard can scroll it. */
function Table(props: ComponentProps<"table">) {
  return (
    <div className="page__table" tabIndex={0} role="region" aria-label="Scrollable table">
      <table {...props} />
    </div>
  );
}

function Pre(props: ComponentProps<"pre">) {
  return <pre className="page__code" tabIndex={0} {...props} />;
}

const SWATCHES = [
  ["backdrop", "Backdrop"],
  ["card-surface", "Card"],
  ["ink", "Ink"],
  ["accent", "Accent"],
];

function ThemeSwatches({ id }: { id: string }) {
  return (
    <ul className="swatches">
      {SWATCHES.map(([token, label]) => (
        <li key={token} className="swatches__item">
          <span className={`swatches__chip swatch--${id}-${token}`} aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}

const components = {
  a: SmartLink,
  h2: (props: { children?: ReactNode }) => <Heading level={2} {...props} />,
  h3: (props: { children?: ReactNode }) => <Heading level={3} {...props} />,
  pre: Pre,
  table: Table,
  ThemeSwatches,
};

export async function renderPage(page: Page) {
  const code = String(await compile(page.body, { format: page.format, outputFormat: "function-body", remarkPlugins: [remarkGfm] }));
  const { default: Content } = await run(code, { ...runtime, baseUrl: import.meta.url });
  return <Content components={components} />;
}
