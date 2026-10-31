import { prepareDeck } from "./index";
import { DeckError } from "../schema/assemble";

try {
  await prepareDeck(process.argv[2] ?? process.cwd(), process.argv[3] === "deployed" ? "deployed" : "local");
} catch (error) {
  // An author's mistake gets its sentence, with no stack.
  console.error(error instanceof DeckError ? `live-ish: ${error.message}` : error);
  process.exit(1);
}
