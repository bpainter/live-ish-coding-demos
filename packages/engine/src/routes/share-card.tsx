import { deck } from "../lib/content";
import { shareCardFacts } from "../lib/share-card";
import { shareCardImage } from "../lib/share-card-image";

export function GET(): Response {
  return shareCardImage(shareCardFacts(deck));
}
