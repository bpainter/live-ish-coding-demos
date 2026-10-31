import Link from "next/link";
import { navGroups } from "../lib/nav";

/** 404: lists the deck's opening, each demo and its closing. No redirect to `/`. */
export default function NotFound() {
  const links = navGroups().flatMap((g) => g.links);
  return (
    <main className="not-found">
      <h1 className="not-found__title">That slide does not exist</h1>
      <ul className="not-found__list">
        {links.map((l) => (
          <li key={l.slideId}>
            <Link href={`/s/${l.slideId}`}>{l.label}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
