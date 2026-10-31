import { prepareDeck } from "../prepare";
import { DeckError } from "../schema/assemble";
import { build, present } from "./hosting";

const [command, ...args] = process.argv.slice(2);

if (command === "build" || command === "present") {
  try {
    process.exitCode = await (command === "build" ? build() : present(args));
  } catch (error) {
    console.error(error instanceof DeckError ? `live-ish: ${error.message}` : error);
    process.exitCode = 1;
  }
} else if (command === "prepare") {
  try {
    const { slides, demos } = await prepareDeck(process.cwd());
    console.log(`Prepared ${slides.length} slides and ${demos.length} demos.`);
  } catch (error) {
    console.error(error instanceof DeckError ? `live-ish: ${error.message}` : error);
    process.exit(1);
  }
} else {
  console.error("Usage: live-ish prepare | build | present [--port=3000] [--no-open]");
  process.exit(2);
}
