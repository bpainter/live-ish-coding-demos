import { notFound } from "next/navigation";
import { PageShell } from "../../lib/PageShell";
import { renderPage } from "../../lib/render";
import { pageBySlug } from "../../lib/source";

export default async function Home() {
  const page = pageBySlug("");
  if (!page) notFound();
  return <PageShell page={page}>{await renderPage(page)}</PageShell>;
}
