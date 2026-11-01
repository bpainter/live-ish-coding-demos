import Link from "next/link";
import type { ReactNode } from "react";
import { NAV, neighbors } from "./nav";
import { allPages, markdownHref, pageHref, type Page } from "./source";

function Sidebar({ current }: { current: string }) {
  const titles = new Map(allPages().map((page) => [page.slug, page.title]));
  return (
    <nav className="sidebar" aria-label="Docs">
      {NAV.map((group) => (
        <section key={group.section} className="sidebar__group">
          <h2 className="sidebar__heading">{group.section}</h2>
          <ul className="sidebar__list">
            {group.slugs.map((slug) => (
              <li key={slug}>
                <Link className="sidebar__link" href={pageHref(slug)} aria-current={slug === current ? "page" : undefined}>
                  {titles.get(slug)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function Pager({ slug }: { slug: string }) {
  const { previous, next } = neighbors(slug);
  const titles = new Map(allPages().map((page) => [page.slug, page.title]));
  if (!previous && !next) return null;
  return (
    <nav className="pager" aria-label="Previous and next page">
      {previous ? (
        <Link className="pager__link" href={pageHref(previous)} rel="prev">
          <span className="pager__label">Previous</span>
          {titles.get(previous)}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link className="pager__link pager__link--next" href={pageHref(next)} rel="next">
          <span className="pager__label">Next</span>
          {titles.get(next)}
        </Link>
      ) : null}
    </nav>
  );
}

export function PageShell({ page, children }: { page: Page; children: ReactNode }) {
  return (
    <div className="shell">
      <main id="main" className="page">
        <h1 className="page__title">{page.title}</h1>
        <p className="page__outcome">{page.outcome}</p>
        <div className="page__body">{children}</div>
        <p className="page__source">
          <a href={markdownHref(page.slug)}>Read this page as Markdown</a>
        </p>
        <Pager slug={page.slug} />
      </main>
      {/* After the page in the source: on a phone the list follows the text, and the grid puts it first on a wide screen. */}
      <Sidebar current={page.slug} />
    </div>
  );
}
