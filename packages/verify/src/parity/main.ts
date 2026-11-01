// Runs `parity()` from a checkout, with no deck around it. A deck reaches it through `live-ish parity`.
import { parity } from "./index";

process.exitCode = await parity(process.argv.slice(2));
