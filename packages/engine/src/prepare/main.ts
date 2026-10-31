import { prepareDeck } from "./index";
import { isDeckError } from "../schema/errors";

try {
  await prepareDeck(process.argv[2] ?? process.cwd(), process.argv[3] === "deployed" ? "deployed" : "local");
} catch (error) {
  // An author's mistake gets its sentence, with no stack.
  console.error(isDeckError(error) ? `live-ish: ${error.message}` : error);
  process.exit(1);
}
