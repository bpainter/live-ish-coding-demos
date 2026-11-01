import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="missing">
      <h1 className="page__title">This page does not exist</h1>
      <p className="missing__text">
        The address may be old. Start from the <Link href="/">docs home</Link> or the <Link href="/errors">rule list</Link>.
      </p>
    </main>
  );
}
