import { demos, slides } from "../lib/content";

export function GET() {
  return Response.json({
    ok: true,
    build: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev",
    slides: slides.length,
    pages: demos.reduce((n, d) => n + d.pages.length, 0),
    // Budgets apply to a production build only, and a walk has to be able to tell.
    server: process.env.NODE_ENV === "production" ? "production" : "development",
  });
}
