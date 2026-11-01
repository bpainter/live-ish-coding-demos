// The docs site is also a deck: `withDeck()` gives it the frame routes, headers and tracing the live
// starter needs on this origin. The rest of the app is ordinary Next.js pages.
import { withDeck } from "@live-ish/engine/next";

export default withDeck({
  next: { serverExternalPackages: ["@mdx-js/mdx"] },
});
