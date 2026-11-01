import { EXIT, EnvironmentError, UsageError } from "./lib/args";
import { REPORT_VERSION } from "./lib/report";

/** Every command this package answers. */
export const COMMANDS = ["walk", "axe", "capture", "og", "warmup", "perf", "backgrounds", "parity"] as const;
export type Command = (typeof COMMANDS)[number];

export interface RunContext {
  /** The deck folder. */
  root: string;
  engineVersion: string;
}

/** Loaded on use, so `walk` never pays for what `perf lighthouse` imports. */
async function dispatch(command: string, argv: string[], context: RunContext): Promise<number> {
  switch (command) {
    case "walk":
      return (await import("./walk")).walk(argv, context);
    case "axe":
      return (await import("./axe")).axe(argv, context);
    case "capture":
      return (await import("./capture")).capture(argv, context);
    case "og":
      return (await import("./og")).og(argv, context);
    case "warmup":
      return (await import("./warmup")).warmup(argv, context);
    case "perf":
      return (await import("./perf")).perf(argv, context);
    case "backgrounds":
      return (await import("./backgrounds")).backgrounds(argv, context);
    case "parity":
      return (await import("./parity")).parity(argv, context);
    default:
      throw new UsageError(`Unknown command "${command}". Commands: ${COMMANDS.join(", ")}.`);
  }
}

/**
 * The engine's CLI calls this with `[command, ...argv]`, and the number it returns is the exit code:
 * 0 pass, 1 findings, 2 misuse, 3 environment.
 */
export async function run(argv: string[], context: RunContext): Promise<number> {
  const [command = "", ...rest] = argv;
  try {
    return await dispatch(command, rest, context);
  } catch (e) {
    const code = e instanceof UsageError ? EXIT.misuse : e instanceof EnvironmentError ? EXIT.environment : null;
    if (code === null) throw e;
    console.error(`live-ish: ${(e as Error).message}`);
    // Stdout under `--json` is always one document, on a failure too.
    if (rest.includes("--json")) console.log(JSON.stringify({ version: REPORT_VERSION, ok: false, error: { code, message: (e as Error).message } }, null, 2));
    return code;
  }
}
