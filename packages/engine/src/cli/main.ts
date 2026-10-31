import { prepareDeck } from "../prepare";
import { DeckError } from "../schema/assemble";

const [command] = process.argv.slice(2);

if (command === "prepare") {
  try {
    const { slides, demos } = await prepareDeck(process.cwd());
    console.log(`Prepared ${slides.length} slides and ${demos.length} demos.`);
  } catch (error) {
    console.error(error instanceof DeckError ? `live-ish: ${error.message}` : error);
    process.exit(1);
  }
} else {
  console.error("Usage: live-ish prepare");
  process.exit(2);
}
