import { prepareDeck } from "./index";
import { isDeckError } from "../schema/errors";

try {
  await prepareDeck(process.argv[2] ?? process.cwd());
} catch (error) {
  // An author's mistake gets its sentence, with no stack.
  console.error(isDeckError(error) ? `live-ish: ${error.message}` : error);
  process.exit(1);
}
