import { demos, slides } from "../lib/content";

export function GET() {
  return Response.json({
    ok: true,
    build: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev",
    slides: slides.length,
    pages: demos.reduce((n, d) => n + d.pages.length, 0),
  });
}
