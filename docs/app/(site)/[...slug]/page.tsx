import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell } from "../../../lib/PageShell";
import { renderPage } from "../../../lib/render";
import { allPages, pageBySlug, pageHref } from "../../../lib/source";

type Props = { params: Promise<{ slug: string[] }> };

export function generateStaticParams() {
  return allPages()
    .filter((page) => page.slug)
    .map((page) => ({ slug: page.slug.split("/") }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = pageBySlug(slug.join("/"));
  if (!page) return {};
  return { title: page.title, description: page.outcome, alternates: { canonical: pageHref(page.slug) } };
}

export default async function DocsPage({ params }: Props) {
  const { slug } = await params;
  const page = pageBySlug(slug.join("/"));
  if (!page) notFound();
  return <PageShell page={page}>{await renderPage(page)}</PageShell>;
}
